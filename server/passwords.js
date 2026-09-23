// Checks a candidate password against the Have I Been Pwned "Pwned Passwords" corpus using
// k-anonymity: only the first five characters of the SHA-1 hash leave the server, and the
// response is padded so its size reveals nothing. The check fails open (network problems
// never block sign-up); the password policy in shared/schemas.js still applies.
import { createHash } from 'node:crypto';

export function createBreachCheck({
  enabled = process.env.PASSWORD_BREACH_CHECK !== 'false',
  fetchImpl = fetch,
  timeoutMs = 3000,
} = {}) {
  let warned = false;
  return async function isBreached(password) {
    if (!enabled) return false;
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5),
      suffix = sha1.slice(5);
    try {
      const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: {
          'Add-Padding': 'true',
          'User-Agent': 'U-Stay-Fit-password-check',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      return body.split(/\r?\n/).some((line) => {
        const [hashSuffix, count] = line.trim().split(':');
        return hashSuffix === suffix && Number(count) > 0;
      });
    } catch (error) {
      if (!warned) {
        warned = true;
        console.warn(`Password breach check unavailable (${error.name}); continuing without it.`);
      }
      return false;
    }
  };
}

// A password built from the person's own name, username, or email address is among the first
// things a targeted attacker tries. Short fragments (under five characters) are ignored so common
// syllables do not cause false alarms.
export const PERSONAL_PASSWORD =
  'Choose a password that does not contain your name, username, or email address.';
export function containsPersonalInfo(password, { name, username, email } = {}) {
  const candidate = String(password).toLowerCase();
  const fragments = [username, email?.split('@')[0], name, ...String(name || '').split(/\s+/)]
    .filter((part) => typeof part === 'string' && part.trim().length >= 5)
    .map((part) => part.trim().toLowerCase());
  return fragments.some((part) => candidate.includes(part));
}
