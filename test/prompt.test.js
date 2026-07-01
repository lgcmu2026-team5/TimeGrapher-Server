import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrompt } from '../src/prompt.js';

test('prompt asks for Key figures as a compact Markdown table', () => {
  const prompt = buildPrompt({
    locale: 'ko-KR',
    logText: 'Detected 28800 BPH. Rate +3.2 s/day.',
    measurementSummary: {
      bph: 28800,
      rateSecondsPerDay: 3.2,
      beatErrorMs: 0.4,
      amplitudeDegrees: 250
    }
  });

  assert.match(prompt.userContent, /## 2\. Key figures/);
  assert.match(prompt.userContent, /compact Markdown table/);
  assert.match(prompt.userContent, /Metric, Value, Note/);
  assert.match(prompt.userContent, /Not provided/);
});
