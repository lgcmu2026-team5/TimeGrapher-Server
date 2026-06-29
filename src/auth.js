import { timingSafeEqual } from 'node:crypto';

export function parseBasicAuth(header) {
  if (typeof header !== 'string' || !header.startsWith('Basic ')) {
    return null;
  }

  const encoded = header.slice('Basic '.length).trim();
  let decoded;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return null;
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex < 0) {
    return null;
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1)
  };
}

export function credentialsConfigured(config) {
  return config.demoUsername.length > 0 && config.demoPassword.length > 0;
}

export function isValidCredentialPair(credentials, config) {
  if (!credentialsConfigured(config) || credentials === null) {
    return false;
  }

  return (
    constantTimeEqual(credentials.username, config.demoUsername) &&
    constantTimeEqual(credentials.password, config.demoPassword)
  );
}

function constantTimeEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
