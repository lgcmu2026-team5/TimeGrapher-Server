# TimeGrapher Gemini Backend

Private backend for TimeGrapher's Gemini-powered explanation feature.

The TimeGrapher app calls this server. This server owns the Gemini API key,
builds the fixed prompt, calls Gemini, and returns only the explanation text.

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

## Local Checks

Run automated tests:

```bash
npm test
```

Run locally without calling Gemini:

```bash
AI_ENABLED=false DEMO_USERNAME=grader DEMO_PASSWORD=secret npm start
```

Then check:

```bash
curl http://127.0.0.1:8787/health
```

## Runtime Configuration

Use environment variables. Do not commit real secrets.

See `.env.example` for the supported keys and the current recommended demo
limits for full CSV log uploads. The runtime reads environment variables; it
does not require a committed `.env` file.

Minimum production secrets:

```text
GEMINI_API_KEY=<server-side Gemini API key>
DEMO_USERNAME=<grader demo username>
DEMO_PASSWORD=<grader demo password>
```

The default local bind address is `127.0.0.1:8787`, intended to sit behind
Caddy or another HTTPS reverse proxy.

## Public API

```http
GET /health
POST /api/watch/explain-measurement-log
Authorization: Basic <base64(username:password)>
Content-Type: application/json
```

The AI endpoint requires consent, authentication, request size limits, rate
limits, and server-owned prompt construction before any Gemini call.

## Documentation

- Backend setup and deployment: `docs/DEPLOYMENT.md`
- Backend implementation guide: `docs/GEMINI_BACKEND_SETUP_GUIDE.md`
- Security decision: `docs/GEMINI_AI_ACCESS_SECURITY.md`
- TimeGrapher app integration: `docs/TIMEGRAPHER_APP_GEMINI_BACKEND_INTEGRATION.md`

## Samples

Sample TimeGrapher CSV logs are stored in `samples/` and are intended to be
safe test fixtures for app and backend integration.
