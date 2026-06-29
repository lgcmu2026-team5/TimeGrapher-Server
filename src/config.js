const DEFAULTS = {
  aiEnabled: true,
  geminiModel: 'gemini-3.5-flash',
  host: '127.0.0.1',
  port: 8787,
  maxLogChars: 20000,
  maxBodyBytes: 65536,
  maxOutputTokens: 700,
  rateLimitPerMinute: 3,
  rateLimitPerDay: 30,
  globalDailyLimit: 500,
  upstreamTimeoutMs: 15000,
  trustProxy: false,
  geminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions'
};

export function readConfig(env = process.env) {
  return {
    aiEnabled: parseBoolean(env.AI_ENABLED, DEFAULTS.aiEnabled),
    geminiApiKey: stringValue(env.GEMINI_API_KEY),
    geminiModel: stringValue(env.GEMINI_MODEL) || DEFAULTS.geminiModel,
    demoUsername: stringValue(env.DEMO_USERNAME),
    demoPassword: stringValue(env.DEMO_PASSWORD),
    host: stringValue(env.HOST) || DEFAULTS.host,
    port: parseInteger(env.PORT, DEFAULTS.port, 1),
    maxLogChars: parseInteger(env.MAX_LOG_CHARS, DEFAULTS.maxLogChars, 1),
    maxBodyBytes: parseInteger(env.MAX_BODY_BYTES, DEFAULTS.maxBodyBytes, 1),
    maxOutputTokens: parseInteger(env.MAX_OUTPUT_TOKENS, DEFAULTS.maxOutputTokens, 1),
    rateLimitPerMinute: parseInteger(env.RATE_LIMIT_PER_MINUTE, DEFAULTS.rateLimitPerMinute, 1),
    rateLimitPerDay: parseInteger(env.RATE_LIMIT_PER_DAY, DEFAULTS.rateLimitPerDay, 1),
    globalDailyLimit: parseInteger(env.GLOBAL_DAILY_LIMIT, DEFAULTS.globalDailyLimit, 1),
    upstreamTimeoutMs: parseInteger(env.UPSTREAM_TIMEOUT_MS, DEFAULTS.upstreamTimeoutMs, 1000),
    trustProxy: parseBoolean(env.TRUST_PROXY, DEFAULTS.trustProxy),
    geminiEndpoint: stringValue(env.GEMINI_ENDPOINT) || DEFAULTS.geminiEndpoint
  };
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBoolean(value, fallback) {
  if (typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseInteger(value, fallback, min) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}
