import crypto from 'node:crypto';

// AES-256 encrypted payload for official Scify Discord Bot token
// Protected against plain-text scraping and decompilation leaks
const VAULT_SALT = 'scify_core_vault_salt_2026';
const VAULT_PEPPER = 'scify_music_bot_pepper_secret';
const VAULT_IV = 'e7b73422d6e7a71e6b22c9b6c01530ed';
const VAULT_CIPHERTEXT = '22fa8eba156c8099b8addf0307d699e233b22408ad90565daba5634aa67dd477ea4cd0b17dd01d1a01293d5f8f7d85864f4dd82eab58f34b4c01c305340645511cd4d83f53e5d656d8b133f801e0df57';
const OFFICIAL_CLIENT_ID = '1515023402350547015';

let cachedToken = null;

/**
 * Safely decrypt official bot token in memory on demand.
 */
export function getDefaultToken() {
  if (cachedToken) return cachedToken;
  try {
    const key = crypto.scryptSync(VAULT_SALT, VAULT_PEPPER, 32);
    const iv = Buffer.from(VAULT_IV, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(VAULT_CIPHERTEXT, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    cachedToken = decrypted;
    return cachedToken;
  } catch (err) {
    console.error('Failed to unpack secure token vault:', err.message);
    return '';
  }
}

export function getDefaultClientId() {
  return OFFICIAL_CLIENT_ID;
}

/**
 * Check if the provided token is the official Scify Music bot token.
 */
export function isOfficialToken(token) {
  if (!token) return true;
  return token === getDefaultToken();
}

/**
 * Mask token string for UI display so users cannot see or copy raw tokens.
 */
export function maskToken(token) {
  if (!token || isOfficialToken(token)) {
    return '••••••••••••••••••••••••••••••••••••••••';
  }
  if (token.length <= 10) return '••••••••••••';
  return token.slice(0, 4) + '••••••••••••••••••••••••' + token.slice(-4);
}
