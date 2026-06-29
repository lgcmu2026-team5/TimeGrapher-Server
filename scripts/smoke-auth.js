#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const envPath = process.argv[2] || '/etc/tg-gemini-backend.env';
const baseUrl = process.argv[3] || 'https://tg-ai.jaehongoh.com';
const env = parseEnvFile(readFileSync(envPath, 'utf8'));

const username = env.DEMO_USERNAME;
const password = env.DEMO_PASSWORD;

if (!username || !password) {
  console.error('DEMO_USERNAME and DEMO_PASSWORD are required in the env file.');
  process.exit(2);
}

const response = await fetch(`${baseUrl}/api/watch/explain-measurement-log`, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    consentGranted: true,
    locale: 'ko-KR',
    appVersion: 'manual-smoke-test',
    logText: 'Detected 28800 BPH. Rate +3.2 s/day. Beat error 0.4 ms. Amplitude 270 deg. Confidence 0.91.',
    measurementSummary: {
      bph: 28800,
      rateSecondsPerDay: 3.2,
      beatErrorMs: 0.4,
      amplitudeDegrees: 270,
      confidence: 0.91
    }
  })
});

const text = await response.text();
console.log(`HTTP ${response.status}`);
console.log(text);

if (!response.ok) {
  process.exit(1);
}

function parseEnvFile(content) {
  const parsed = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripQuotes(line.slice(separatorIndex + 1).trim());
    parsed[key] = value;
  }

  return parsed;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
