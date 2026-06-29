import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { GeminiUpstreamError } from '../src/geminiClient.js';

const BASE_ENV = {
  AI_ENABLED: 'true',
  DEMO_USERNAME: 'grader',
  DEMO_PASSWORD: 'secret',
  GEMINI_API_KEY: 'test-key',
  GEMINI_MODEL: 'gemini-test',
  RATE_LIMIT_PER_MINUTE: '100',
  RATE_LIMIT_PER_DAY: '100',
  GLOBAL_DAILY_LIMIT: '100',
  MAX_BODY_BYTES: '2048',
  MAX_LOG_CHARS: '2000'
};

test('GET /health returns ok without secrets', async () => {
  const app = await startTestApp();
  const response = await fetch(`${app.baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: 'ok' });
  await app.close();
});

test('missing Basic Auth returns 401', async () => {
  const app = await startTestApp();
  const response = await postExplain(app.baseUrl, {}, { auth: false });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, 'unauthorized');
  await app.close();
});

test('wrong Basic Auth returns 401', async () => {
  const app = await startTestApp();
  const response = await postExplain(app.baseUrl, {}, { password: 'wrong' });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, 'unauthorized');
  await app.close();
});

test('missing consent returns 400 before Gemini call', async () => {
  let calls = 0;
  const app = await startTestApp({ geminiClient: { explain: async () => { calls += 1; } } });
  const response = await postExplain(app.baseUrl, { consentGranted: false });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, 'missing_consent');
  assert.equal(calls, 0);
  await app.close();
});

test('missing logText returns 400 before Gemini call', async () => {
  let calls = 0;
  const app = await startTestApp({ geminiClient: { explain: async () => { calls += 1; } } });
  const response = await postExplain(app.baseUrl, { logText: '' });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, 'missing_log');
  assert.equal(calls, 0);
  await app.close();
});

test('oversized request body returns 413 before Gemini call', async () => {
  let calls = 0;
  const app = await startTestApp({
    env: { MAX_BODY_BYTES: '80' },
    geminiClient: { explain: async () => { calls += 1; } }
  });
  const response = await postExplain(app.baseUrl, { logText: 'x'.repeat(100) });
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.equal(body.error, 'body_too_large');
  assert.equal(calls, 0);
  await app.close();
});

test('oversized logText returns 413 before Gemini call', async () => {
  let calls = 0;
  const app = await startTestApp({
    env: { MAX_LOG_CHARS: '10', MAX_BODY_BYTES: '2048' },
    geminiClient: { explain: async () => { calls += 1; } }
  });
  const response = await postExplain(app.baseUrl, { logText: 'x'.repeat(11) });
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.equal(body.error, 'log_too_large');
  assert.equal(calls, 0);
  await app.close();
});

test('rate limit excess returns 429 before Gemini call', async () => {
  let calls = 0;
  const app = await startTestApp({
    env: { RATE_LIMIT_PER_MINUTE: '1' },
    geminiClient: {
      explain: async () => {
        calls += 1;
        return { explanation: 'ok', model: 'gemini-test' };
      }
    }
  });

  assert.equal((await postExplain(app.baseUrl)).status, 200);
  const response = await postExplain(app.baseUrl);
  const body = await response.json();

  assert.equal(response.status, 429);
  assert.equal(body.error, 'rate_limit_minute');
  assert.equal(calls, 1);
  await app.close();
});

test('AI_ENABLED=false returns 503 before Gemini call', async () => {
  let calls = 0;
  const app = await startTestApp({
    env: { AI_ENABLED: 'false' },
    geminiClient: { explain: async () => { calls += 1; } }
  });
  const response = await postExplain(app.baseUrl);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error, 'ai_disabled');
  assert.equal(calls, 0);
  await app.close();
});

test('valid request returns explanation from Gemini client', async () => {
  const app = await startTestApp({
    geminiClient: {
      explain: async ({ systemPrompt, userContent }) => {
        assert.match(systemPrompt, /timegrapher log analyst/);
        assert.match(userContent, /BEGIN TIMEGRAPHER LOG/);
        assert.match(userContent, /분석 규칙/);
        return { explanation: '테스트 설명입니다.', model: 'gemini-test' };
      }
    }
  });
  const response = await postExplain(app.baseUrl);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.explanation, '테스트 설명입니다.');
  assert.equal(body.model, 'gemini-test');
  await app.close();
});

test('Gemini upstream failure returns safe 502', async () => {
  const app = await startTestApp({
    geminiClient: {
      explain: async () => {
        throw new GeminiUpstreamError('raw upstream error', 500);
      }
    }
  });
  const response = await postExplain(app.baseUrl);
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.error, 'gemini_upstream_failed');
  assert.doesNotMatch(body.message, /raw upstream error/);
  await app.close();
});

test('Gemini upstream timeout returns safe 504', async () => {
  const app = await startTestApp({
    geminiClient: {
      explain: async () => {
        throw new GeminiUpstreamError('raw timeout detail', 504);
      }
    }
  });
  const response = await postExplain(app.baseUrl);
  const body = await response.json();

  assert.equal(response.status, 504);
  assert.equal(body.error, 'gemini_upstream_timeout');
  assert.doesNotMatch(body.message, /raw timeout detail/);
  await app.close();
});

async function startTestApp({ env = {}, geminiClient } = {}) {
  const config = readConfig({ ...BASE_ENV, ...env });
  const server = createApp({
    config,
    geminiClient: geminiClient || {
      explain: async () => ({ explanation: 'ok', model: config.geminiModel })
    },
    logger: () => {}
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

function postExplain(baseUrl, overrideBody = {}, options = {}) {
  const body = {
    consentGranted: true,
    locale: 'ko-KR',
    appVersion: 'test',
    logText: 'Detected 28800 BPH. Rate +3.2 s/day.',
    measurementSummary: {
      bph: 28800,
      rateSecondsPerDay: 3.2
    },
    ...overrideBody
  };

  const headers = {
    'Content-Type': 'application/json'
  };

  if (options.auth !== false) {
    const username = options.username || BASE_ENV.DEMO_USERNAME;
    const password = options.password || BASE_ENV.DEMO_PASSWORD;
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  return fetch(`${baseUrl}/api/watch/explain-measurement-log`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}
