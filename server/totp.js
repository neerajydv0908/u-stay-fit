// Time-based one-time passwords (RFC 6238) and encrypted storage of their secrets.
// Implemented with node:crypto only; no third-party authenticator library is needed.
import {
  createHmac,
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buffer) {
  let bits = 0,
    value = 0,
    output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}
export function base32Decode(text) {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes = [];
  let bits = 0,
    value = 0;
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
export const generateSecret = () => base32Encode(randomBytes(20));
export const timeStep = (now = Date.now(), period = 30) => Math.floor(now / 1000 / period);
export function totpCode(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digestValue = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digestValue[19] & 15;
  const binary =
    ((digestValue[offset] & 127) << 24) |
    (digestValue[offset + 1] << 16) |
    (digestValue[offset + 2] << 8) |
    digestValue[offset + 3];
  return String(binary % 1000000).padStart(6, '0');
}
// Accepts the current step and one step either side (clock drift); returns the matching step.
export function verifyTotp(secret, code, { now = Date.now(), lastStep = null } = {}) {
  const entered = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(entered)) return null;
  const current = timeStep(now);
  for (const step of [current, current - 1, current + 1]) {
    if (lastStep != null && step <= Number(lastStep)) continue; // A code can only be used once.
    const expected = Buffer.from(totpCode(secret, step));
    if (timingSafeEqual(expected, Buffer.from(entered))) return step;
  }
  return null;
}
export const otpauthUrl = (secret, account, issuer = 'U Stay Fit') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

// Secrets are encrypted at rest with a key derived from APP_SECRET, so a database copy alone
// cannot generate valid codes.
const key = (appSecret) => createHash('sha256').update(appSecret).digest();
export function encryptSecret(plain, appSecret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(appSecret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64url')).join('.');
}
// The optional previous secret lets APP_SECRET be rotated: values still encrypted with the old
// key keep working until they are re-encrypted (see encryptedWith / the sign-in path).
export function decryptSecret(stored, appSecret, previousSecret) {
  const [iv, tag, encrypted] = stored.split('.').map((part) => Buffer.from(part, 'base64url'));
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(appSecret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (error) {
    if (!previousSecret) throw error;
    return decryptSecret(stored, previousSecret);
  }
}
export function encryptedWith(stored, appSecret) {
  try {
    decryptSecret(stored, appSecret);
    return true;
  } catch {
    return false;
  }
}
// Recovery codes are shown once and stored hashed, like passwords.
export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(10)).slice(0, 10).toLowerCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
export const normalizeRecoveryCode = (code) =>
  String(code || '')
    .toLowerCase()
    .replace(/[^a-z2-7]/g, '');
