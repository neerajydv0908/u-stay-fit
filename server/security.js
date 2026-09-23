import { scrypt as callback, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(callback);
const CURRENT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, CURRENT);
  return `scrypt:v2:32768:8:3:${salt}:${key.toString('hex')}`;
}
const dummyHash = await hashPassword(token());
export const needsPasswordUpgrade = (stored) => Boolean(stored && !stored.startsWith('scrypt:v2:'));
export async function verifyPassword(password, stored) {
  const parts = (stored || dummyHash).split(':');
  let salt, expected, options;
  if (parts.length === 3 && parts[0] === 'scrypt') {
    [, salt, expected] = parts;
    options = { ...CURRENT, p: 1 };
  } else if (parts.length === 7 && parts.slice(0, 5).join(':') === 'scrypt:v2:32768:8:3') {
    salt = parts[5];
    expected = parts[6];
    options = CURRENT;
  } else return false;
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(expected)) return false;
  const actual = await scrypt(password, salt, 64, options);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  email: u.email,
  emailVerified: Boolean(u.email_verified_at),
  hasPassword: Boolean(u.password_hash),
  twoFactorEnabled: Boolean(u.totp_enabled_at),
  consentedAt: u.consented_at || null,
  createdAt: u.created_at || null,
});
