import assert from 'node:assert/strict';
import test from 'node:test';
import { GeminiUpstreamError, createGeminiClient } from '../src/geminiClient.js';

test('Gemini client extracts text from Interactions API steps response', async () => {
  const client = createGeminiClient(
    {
      geminiApiKey: 'test-key',
      geminiEndpoint: 'https://example.invalid/interactions',
      geminiModel: 'gemini-test',
      maxOutputTokens: 700,
      upstreamTimeoutMs: 15000
    },
    async () => new Response(JSON.stringify({
      model: 'gemini-test',
      status: 'completed',
      steps: [
        {
          type: 'model_output',
          content: [
            {
              type: 'text',
              text: '인터랙션 응답입니다.'
            }
          ]
        }
      ]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  );

  const result = await client.explain({
    systemPrompt: 'system',
    userContent: 'user'
  });

  assert.deepEqual(result, {
    explanation: '인터랙션 응답입니다.',
    model: 'gemini-test'
  });
});

test('Gemini client maps aborts to upstream timeout', async () => {
  const client = createGeminiClient(
    {
      geminiApiKey: 'test-key',
      geminiEndpoint: 'https://example.invalid/interactions',
      geminiModel: 'gemini-test',
      maxOutputTokens: 700,
      upstreamTimeoutMs: 1000
    },
    async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
  );

  let caught;
  try {
    await client.explain({ systemPrompt: 'system', userContent: 'user' });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof GeminiUpstreamError);
  assert.equal(caught.statusCode, 504);
});
