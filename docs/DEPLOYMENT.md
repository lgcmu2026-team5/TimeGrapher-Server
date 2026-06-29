# Deployment Notes

Status: two HTTPS backend deployments are available.
Last reviewed: 2026-06-29

Current public backends:

```text
Primary VPS backend:
https://tg-ai.jaehongoh.com

AWS Learner Lab backend:
https://tg-ai-cmu-aws.jaehongoh.com
```

Both deployments expose the same API contract:

```text
GET  /health
POST /api/watch/explain-measurement-log
```

The backend process must bind only to localhost:

```text
HOST=127.0.0.1
PORT=8787
```

Public HTTPS is provided by Caddy on the origin, with Cloudflare optionally
proxying the hostname in front of Caddy.

## 1. Runtime Secrets

Create `/etc/tg-gemini-backend.env` from
`deploy/tg-gemini-backend.env.example` and fill in real values on the target
server only:

```bash
sudo install -m 600 -o root -g root deploy/tg-gemini-backend.env.example /etc/tg-gemini-backend.env
sudoedit /etc/tg-gemini-backend.env
```

Recommended current limits:

```text
AI_ENABLED=true
GEMINI_MODEL=gemini-3.5-flash
HOST=127.0.0.1
PORT=8787
MAX_LOG_CHARS=100000
MAX_BODY_BYTES=262144
MAX_OUTPUT_TOKENS=4096
RATE_LIMIT_PER_MINUTE=3
RATE_LIMIT_PER_DAY=30
GLOBAL_DAILY_LIMIT=500
UPSTREAM_TIMEOUT_MS=15000
TRUST_PROXY=true
```

Required secrets:

```text
GEMINI_API_KEY=<server-side Gemini API key>
DEMO_USERNAME=<grader demo username>
DEMO_PASSWORD=<grader demo password>
```

Do not paste real secrets into chat, public screenshots, git, README files, or
issue comments.

## 2. Systemd Service

The VPS deployment uses the local Node path in
`deploy/tg-gemini-backend.service.example`.

Install the VPS unit from the repository root:

```bash
sudo install -m 644 deploy/tg-gemini-backend.service.example /etc/systemd/system/tg-gemini-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now tg-gemini-backend
sudo systemctl status tg-gemini-backend --no-pager
```

For AWS Ubuntu EC2, create this unit:

```bash
sudo tee /etc/systemd/system/tg-gemini-backend.service >/dev/null <<'EOF'
[Unit]
Description=TimeGrapher Gemini Backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/tg-gemini
EnvironmentFile=/etc/tg-gemini-backend.env
ExecStart=/usr/bin/node /home/ubuntu/tg-gemini/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

Then start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tg-gemini-backend
sudo systemctl status tg-gemini-backend --no-pager
```

Local smoke test:

```bash
curl http://127.0.0.1:8787/health
```

Expected:

```json
{"status":"ok"}
```

## 3. Primary VPS Deployment

The primary VPS is fronted by Caddy and Cloudflare:

```text
Cloudflare proxied DNS
-> Caddy on origin
-> http://127.0.0.1:8787
```

Hostname:

```text
tg-ai.jaehongoh.com
```

Cloudflare requirements:

- DNS record may be proxied.
- SSL/TLS mode must be `Full (strict)`.
- Bot Fight Mode must not challenge this API host/path.
- API paths should use WAF block/rate-limit rules, not Managed Challenge.
- If `curl` or the desktop app receives `HTTP 403` with `Cf-Mitigated: challenge`, Cloudflare is challenging the API request and the rule needs to be removed or bypassed.

Health check:

```bash
curl -fsS https://tg-ai.jaehongoh.com/health
```

## 4. AWS Learner Lab Deployment

The AWS deployment runs on an Ubuntu EC2 instance in Learner Lab:

```text
Cloudflare DNS
-> EC2 Elastic IP
-> Caddy on EC2
-> http://127.0.0.1:8787
```

Hostname:

```text
tg-ai-cmu-aws.jaehongoh.com
```

Use an Elastic IP. Without an Elastic IP, the EC2 public IPv4 address can change
after stop/start and the Cloudflare A record would need to be updated.

Cloudflare DNS:

```text
Type: A
Name: tg-ai-cmu-aws
Content: <EC2 Elastic IP>
Proxy status: DNS only or proxied
TTL: Auto
```

If proxied, keep SSL/TLS mode at `Full (strict)`.

AWS security group must allow:

```text
TCP 22  from your admin IP
TCP 80  from the internet or Cloudflare
TCP 443 from the internet or Cloudflare
```

If the hostname is proxied through Cloudflare and no DNS-only service shares the
same origin, `80/443` can later be restricted to Cloudflare IP ranges. Keep SSH
restricted to the admin IP.

EC2 Caddyfile:

```caddyfile
tg-ai-cmu-aws.jaehongoh.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8787
}
```

Health check:

```bash
curl -fsS https://tg-ai-cmu-aws.jaehongoh.com/health
```

## 5. Cloudflare API Rules

Do not use JavaScript/Managed Challenge for API clients. Desktop apps, `curl`,
and ordinary HTTP clients cannot solve browser challenges.

This problem appears as:

```text
HTTP 403
Cf-Mitigated: challenge
service: Bot Fight Mode
```

Recommended Cloudflare protection:

- Turn off Bot Fight Mode for this API use case if it challenges API requests.
- Block unknown paths.
- Block wrong HTTP methods.
- Add rate limiting for the AI POST endpoint.
- Prefer `Block` or rate-limit actions for API traffic; do not use browser challenges on these two endpoints.

Suggested custom rule to block unknown paths:

```text
http.host in {"tg-ai.jaehongoh.com" "tg-ai-cmu-aws.jaehongoh.com"}
and not http.request.uri.path in {"/health" "/api/watch/explain-measurement-log"}
```

Action:

```text
Block
```

Suggested method rule:

```text
http.host in {"tg-ai.jaehongoh.com" "tg-ai-cmu-aws.jaehongoh.com"}
and (
  (http.request.uri.path eq "/health" and http.request.method ne "GET") or
  (http.request.uri.path eq "/api/watch/explain-measurement-log" and http.request.method ne "POST")
)
```

Action:

```text
Block
```

Suggested rate limit target:

```text
http.host in {"tg-ai.jaehongoh.com" "tg-ai-cmu-aws.jaehongoh.com"}
and http.request.uri.path eq "/api/watch/explain-measurement-log"
and http.request.method eq "POST"
```

Use a low demo-oriented threshold, for example `3 requests per minute per IP`.

## 6. Smoke Tests

Health checks:

```bash
curl -fsS https://tg-ai.jaehongoh.com/health
curl -fsS https://tg-ai-cmu-aws.jaehongoh.com/health
```

Expected:

```json
{"status":"ok"}
```

Unauthorized POST should return `401`:

```bash
for BASE in \
  https://tg-ai.jaehongoh.com \
  https://tg-ai-cmu-aws.jaehongoh.com
do
  echo "== $BASE =="
  curl -sS -i \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"consentGranted":true,"logText":"test"}' \
    "$BASE/api/watch/explain-measurement-log" \
  | sed -n '1,12p'
done
```

Authenticated smoke test, primary VPS:

```bash
sudo /home/jaehong5/.nvm/versions/node/v24.13.1/bin/node \
  scripts/smoke-auth.js \
  /etc/tg-gemini-backend.env \
  https://tg-ai.jaehongoh.com
```

Authenticated smoke test, AWS server:

```bash
ssh -i ~/.ssh/labsuser.pem ubuntu@<EC2_ELASTIC_IP> \
  'cd ~/tg-gemini && sudo /usr/bin/node scripts/smoke-auth.js /etc/tg-gemini-backend.env https://tg-ai-cmu-aws.jaehongoh.com'
```

Expected:

```text
HTTP 200
response contains requestId, explanation, and model
```
