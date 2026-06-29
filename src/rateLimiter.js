const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function createRateLimiter(config, now = () => Date.now()) {
  const minuteBuckets = new Map();
  const dayBuckets = new Map();
  const globalDayKey = 'global';

  return {
    check(clientKey) {
      cleanup(minuteBuckets, now());
      cleanup(dayBuckets, now());

      const minute = increment(minuteBuckets, clientKey, MINUTE_MS, now);
      if (minute.count > config.rateLimitPerMinute) {
        return { allowed: false, reason: 'rate_limit_minute' };
      }

      const day = increment(dayBuckets, clientKey, DAY_MS, now);
      if (day.count > config.rateLimitPerDay) {
        return { allowed: false, reason: 'rate_limit_day' };
      }

      const globalDay = increment(dayBuckets, globalDayKey, DAY_MS, now);
      if (globalDay.count > config.globalDailyLimit) {
        return { allowed: false, reason: 'quota_global_day' };
      }

      return { allowed: true };
    }
  };
}

function increment(buckets, key, windowMs, now) {
  const currentTime = now();
  const existing = buckets.get(key);

  if (existing && existing.expiresAt > currentTime) {
    existing.count += 1;
    return existing;
  }

  const bucket = {
    count: 1,
    expiresAt: currentTime + windowMs
  };
  buckets.set(key, bucket);
  return bucket;
}

function cleanup(buckets, currentTime) {
  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= currentTime) {
      buckets.delete(key);
    }
  }
}
