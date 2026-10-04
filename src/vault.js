// Secure credential manager for Sruti
// Zero hardcoded secrets or developer credentials are baked into client binaries.

let cachedToken = null;

/**
 * Returns Discord Bot token from environment (.env) or runtime cache.
 */
export function getDefaultToken() {
  if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== 'your-bot-token-here' && process.env.DISCORD_TOKEN.length > 20) {
    return process.env.DISCORD_TOKEN;
  }
  return cachedToken || '';
}

export function setDefaultToken(token) {
  cachedToken = token;
  process.env.DISCORD_TOKEN = token;
}

export function getDefaultClientId() {
  return process.env.DISCORD_CLIENT_ID || '';
}

export function isOfficialToken(token) {
  return false;
}

/**
 * Mask token string for UI display so tokens are never exposed in plain view.
 */
export function maskToken(token) {
  if (!token) return '';
  if (token.length <= 10) return '••••••••••••';
  return token.slice(0, 4) + '••••••••••••••••••••••••' + token.slice(-4);
}
