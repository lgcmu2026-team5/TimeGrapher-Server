import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { parseBasicAuth, credentialsConfigured, isValidCredentialPair } from './auth.js';
import { readConfig } from './config.js';
import { GeminiConfigError, GeminiUpstreamError, createGeminiClient } from './geminiClient.js';
import { buildPrompt, normalizeRequestBody } from './prompt.js';
import { createRateLimiter } from './rateLimiter.js';

const AI_PATH = '/api/watch/explain-measurement-log';

export function createApp(options = {}) {
  const config = options.config || readConfig();
  const logger = options.logger || defaultLogger;
  const geminiClient = options.geminiClient || createGeminiClient(config);
  const rateLimiter = options.rateLimiter || createRateLimiter(config);

  return http.createServer(async (request, response) => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const endpoint = new URL(request.url, 'http://localhost').pathname;

    try {
      if (request.method === 'GET' && endpoint === '/health') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      if (request.method !== 'POST' || endpoint !== AI_PATH) {
        sendJson(response, 404, { requestId, error: 'not_found', message: 'Not found.' });
        return;
      }

      const credentials = parseBasicAuth(request.headers.authorization);
      if (!credentials) {
        sendUnauthorized(response, requestId);
        return;
      }

      if (!credentialsConfigured(config)) {
        sendJson(response, 503, {
          requestId,
          error: 'service_not_configured',
          message: 'AI explanation service is not configured.'
        });
        return;
      }

      if (!isValidCredentialPair(credentials, config)) {
        sendUnauthorized(response, requestId);
        return;
      }

      if (!config.aiEnabled) {
        sendJson(response, 503, {
          requestId,
          error: 'ai_disabled',
          message: 'AI explanation service is currently unavailable.'
        });
        return;
      }

      const clientKey = `${getClientIp(request, config)}:${credentials.username}`;
      const limit = rateLimiter.check(clientKey);
      if (!limit.allowed) {
        sendJson(response, 429, {
          requestId,
          error: limit.reason,
          message: 'Too many requests. Please try again later.'
        });
        return;
      }

      const body = await readJsonBody(request, config.maxBodyBytes);
      const normalized = normalizeRequestBody(body.value, config.maxLogChars);
      if (!normalized.ok) {
        sendJson(response, normalized.status, {
          requestId,
          error: normalized.error,
          message: normalized.message
        });
        return;
      }

      const prompt = buildPrompt(normalized.value);
      const result = await geminiClient.explain(prompt);

      sendJson(response, 200, {
        requestId,
        explanation: result.explanation,
        model: result.model || config.geminiModel
      });
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        sendJson(response, 413, {
          requestId,
          error: 'body_too_large',
          message: 'Request body is too large.'
        });
        return;
      }

      if (error instanceof InvalidJsonError) {
        sendJson(response, 400, {
          requestId,
          error: 'invalid_json',
          message: 'Request body must be valid JSON.'
        });
        return;
      }

      if (error instanceof GeminiConfigError) {
        sendJson(response, 503, {
          requestId,
          error: 'service_not_configured',
          message: 'AI explanation service is not configured.'
        });
        return;
      }

      if (error instanceof GeminiUpstreamError) {
        const statusCode = error.statusCode === 504 ? 504 : 502;
        sendJson(response, statusCode, {
          requestId,
          error: statusCode === 504 ? 'gemini_upstream_timeout' : 'gemini_upstream_failed',
          message: statusCode === 504
            ? 'AI explanation service timed out upstream.'
            : 'AI explanation service failed upstream.'
        });
        return;
      }

      sendJson(response, 500, {
        requestId,
        error: 'internal_error',
        message: 'Unexpected server error.'
      });
    } finally {
      logger({
        requestId,
        endpoint,
        method: request.method,
        statusCode: response.statusCode,
        responseTimeMs: Date.now() - startedAt
      });
    }
  });
}

class BodyTooLargeError extends Error {}
class InvalidJsonError extends Error {}

async function readJsonBody(request, maxBodyBytes) {
  const contentLength = Number.parseInt(request.headers['content-length'] || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    throw new BodyTooLargeError();
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxBodyBytes) {
      throw new BodyTooLargeError();
    }
    chunks.push(chunk);
  }

  try {
    return {
      value: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      bytes: totalBytes
    };
  } catch {
    throw new InvalidJsonError();
  }
}

function getClientIp(request, config) {
  if (config.trustProxy) {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return forwardedFor.split(',')[0].trim();
    }
  }

  return request.socket.remoteAddress || 'unknown';
}

function sendUnauthorized(response, requestId) {
  response.setHeader('WWW-Authenticate', 'Basic realm="TimeGrapher Gemini"');
  sendJson(response, 401, {
    requestId,
    error: 'unauthorized',
    message: 'Authentication required.'
  });
}

function sendJson(response, statusCode, payload) {
  if (response.headersSent) {
    return;
  }

  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(`${JSON.stringify(payload)}\n`);
}

function defaultLogger(entry) {
  console.info(JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry
  }));
}
