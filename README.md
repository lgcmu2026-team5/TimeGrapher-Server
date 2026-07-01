# TimeGrapher Gemini Backend

Private backend for TimeGrapher's Gemini-powered explanation feature.

The TimeGrapher app calls this server. This server owns the Gemini API key,
builds a fixed server-side prompt, enforces upload consent and request limits,
calls Gemini, and returns a small JSON response whose `explanation` field holds
the generated text. The prompt instructs Gemini to answer in English as a fixed
five-section Markdown report (`Conclusion`, `Key figures`, `Anomalies observed`,
`Confidence and limits`, `Recommended actions`) and treats the uploaded log as
untrusted data.

## Current Deployments

```text
Primary:
https://tg-ai.jaehongoh.com

AWS Learner Lab:
https://tg-ai-cmu-aws.jaehongoh.com
```

Both deployments expose the same API contract. The app should treat the backend
base URL as configuration so the primary backend can be used by default and the
AWS Learner Lab backend can be used for demo fallback or comparison testing.

## Server Access and Rollout

Primary VPS:

```bash
ssh jaehong5@dalaran
cd ~/tg-gemini
git pull
sudo systemctl restart tg-gemini-backend
sudo systemctl status tg-gemini-backend --no-pager
curl -fsS https://tg-ai.jaehongoh.com/health
```

AWS Learner Lab:

```bash
ssh -i ~/.ssh/labsuser.pem ubuntu@tg-ai-cmu-aws.jaehongoh.com
cd ~/tg-gemini
git pull
sudo systemctl restart tg-gemini-backend
sudo systemctl status tg-gemini-backend --no-pager
curl -fsS https://tg-ai-cmu-aws.jaehongoh.com/health
```

Alternatively, `scripts/pull-and-restart.sh` performs the same rollout in one
step: it runs `git pull --ff-only`, restarts the service, prints its status,
and polls the local `/health` endpoint (retrying, then dumping recent logs on
failure). It reads `SERVICE_NAME`, `HEALTH_URL`, `HEALTH_RETRIES`, and
`HEALTH_RETRY_DELAY_SECONDS` from the environment, defaulting to the
`tg-gemini-backend` service and `http://127.0.0.1:8787/health`.

Both servers run the same Node service:

```text
systemd unit: tg-gemini-backend
working dir:  /home/<user>/tg-gemini
env file:     /etc/tg-gemini-backend.env
bind:         127.0.0.1:8787
public TLS:   Caddy reverse proxy -> 127.0.0.1:8787
```

Keep deployment changes in git. Do not patch source files directly on one
server; commit and push here, then `git pull` and restart both backends.

### Deployment templates

The `deploy/` directory holds copy-and-edit examples for a fresh host:

- `deploy/tg-gemini-backend.service.example` — systemd unit (installs to
  `/etc/systemd/system/tg-gemini-backend.service`).
- `deploy/tg-gemini-backend.env.example` — production env file with the
  deployed limits (installs to `/etc/tg-gemini-backend.env`).
- `deploy/caddy-tg-ai.example` — Caddy site block terminating TLS and reverse
  proxying to `127.0.0.1:8787`.

## Local Checks

Run automated tests:

```bash
npm test
```

Run locally without calling Gemini (the AI endpoint returns `ai_disabled`,
while `/health` and auth still work):

```bash
AI_ENABLED=false DEMO_USERNAME=grader DEMO_PASSWORD=secret npm start
```

Then check:

```bash
curl http://127.0.0.1:8787/health
```

After a deploy, `scripts/smoke-auth.js` runs an authenticated end-to-end request
against a running backend. It reads `DEMO_USERNAME` / `DEMO_PASSWORD` from an env
file and posts a sample log, then prints the HTTP status and response body:

```bash
node scripts/smoke-auth.js /etc/tg-gemini-backend.env https://tg-ai.jaehongoh.com
```

Both arguments are optional and default to `/etc/tg-gemini-backend.env` and
`https://tg-ai.jaehongoh.com`.

## Runtime Configuration

Use environment variables. Do not commit real secrets. The runtime reads
environment variables directly; it does not require a committed `.env` file.

Two templates are provided:

- `.env.example` — every supported key with local-friendly defaults
  (`TRUST_PROXY=false`, no reverse proxy locally).
- `deploy/tg-gemini-backend.env.example` — the production values copied to
  `/etc/tg-gemini-backend.env` (`TRUST_PROXY=true`, behind Caddy).

Minimum production secrets:

```text
GEMINI_API_KEY=<server-side Gemini API key>
DEMO_USERNAME=<grader demo username>
DEMO_PASSWORD=<grader demo password>
```

Without `GEMINI_API_KEY` the AI endpoint returns `service_not_configured`;
without `DEMO_USERNAME` / `DEMO_PASSWORD` all authenticated requests are
rejected.

### Supported variables

Any unset key falls back to the built-in default below. The deployed env files
raise several limits above these conservative defaults.

| Variable | Default | Notes |
| --- | --- | --- |
| `AI_ENABLED` | `true` | Set `false` to serve `ai_disabled` without calling Gemini. |
| `GEMINI_API_KEY` | *(empty)* | Server-side key; required for real calls. |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Model name sent to the upstream. |
| `GEMINI_ENDPOINT` | `https://generativelanguage.googleapis.com/v1beta/interactions` | Upstream URL; override only for testing. |
| `DEMO_USERNAME` | *(empty)* | Basic-auth username; required. |
| `DEMO_PASSWORD` | *(empty)* | Basic-auth password; required. |
| `HOST` | `127.0.0.1` | Local bind address (behind an HTTPS reverse proxy). |
| `PORT` | `8787` | Local bind port. |
| `MAX_LOG_CHARS` | `20000` | Max Unicode characters in `logText`. |
| `MAX_BODY_BYTES` | `65536` | Max request body size in bytes. |
| `MAX_OUTPUT_TOKENS` | `16384` | Upstream `max_output_tokens`. |
| `RATE_LIMIT_PER_MINUTE` | `3` | Per-client (IP + username) requests per minute. |
| `RATE_LIMIT_PER_DAY` | `30` | Per-client requests per day. |
| `GLOBAL_DAILY_LIMIT` | `500` | Global requests per day across all clients. |
| `UPSTREAM_TIMEOUT_MS` | `120000` | Gemini request timeout; a timeout returns `gemini_upstream_timeout`. |
| `TRUST_PROXY` | `false` | When `true`, use the first `X-Forwarded-For` hop as the client IP for rate limiting. Set `true` behind Caddy. |

Deployed limits (from the env templates):

```text
MAX_LOG_CHARS=100000
MAX_BODY_BYTES=262144
MAX_OUTPUT_TOKENS=16384
UPSTREAM_TIMEOUT_MS=120000
RATE_LIMIT_PER_MINUTE=10
RATE_LIMIT_PER_DAY=300
GLOBAL_DAILY_LIMIT=500
TRUST_PROXY=true
```

## Public API

```http
GET /health
POST /api/watch/explain-measurement-log
Authorization: Basic <base64(username:password)>
Content-Type: application/json
```

`GET /health` returns `200 {"status":"ok"}` and requires no authentication.

The AI endpoint requires consent, authentication, request size limits, rate
limits, and server-owned prompt construction before any Gemini call. Responses
are JSON with `Cache-Control: no-store` and carry a `requestId`.

Request body:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `consentGranted` | boolean | yes | Must be exactly `true`, or the request is rejected with `missing_consent`. |
| `logText` | string | yes | Non-empty measurement log; capped at `MAX_LOG_CHARS`. |
| `locale` | string | no | BCP-47 locale hint; defaults to `en-US` (max 20 chars). |
| `appVersion` | string | no | Client version tag (max 100 chars). |
| `measurementSummary` | object | no | Optional numeric fields: `bph`, `rateSecondsPerDay`, `beatErrorMs`, `amplitudeDegrees`, `confidence`. Non-numeric values are dropped. |

Success returns `200`:

```json
{
  "requestId": "…",
  "explanation": "## 1. Conclusion\n…",
  "model": "gemini-3.5-flash"
}
```

Error responses share the shape `{ "requestId", "error", "message" }`:

| Status | `error` | Cause |
| --- | --- | --- |
| 400 | `missing_consent` / `missing_log` / `invalid_json` | Bad or incomplete request body. |
| 401 | `unauthorized` | Missing or invalid Basic credentials. |
| 413 | `body_too_large` / `log_too_large` | Body exceeds `MAX_BODY_BYTES` / log exceeds `MAX_LOG_CHARS`. |
| 429 | `rate_limit_minute` / `rate_limit_day` / `quota_global_day` | Rate or quota limit exceeded. |
| 503 | `service_not_configured` / `ai_disabled` | Missing key or credentials / `AI_ENABLED=false`. |
| 502 / 504 | `gemini_upstream_failed` / `gemini_upstream_timeout` | Upstream Gemini error or timeout. |
| 500 | `internal_error` | Unexpected server error. |

## Documentation

- Backend setup and deployment: `docs/DEPLOYMENT.md`
- Backend implementation guide: `docs/GEMINI_BACKEND_SETUP_GUIDE.md`
- Security decision: `docs/GEMINI_AI_ACCESS_SECURITY.md`
- TimeGrapher app integration: `docs/TIMEGRAPHER_APP_GEMINI_BACKEND_INTEGRATION.md`

## Samples

A sample TimeGrapher CSV log is stored in `samples/` and is intended to be a
safe test fixture for app and backend integration.
