// One small mail abstraction with three transports:
//   RESEND_API_KEY  → Resend's HTTP API (no extra dependency)
//   SMTP_URL        → any SMTP provider through nodemailer (smtps://user:pass@host:465)
//   neither         → development only: messages are printed to the server console
// Production refuses to start without a real transport, because verification and password
// reset depend on email actually being delivered.
import nodemailer from 'nodemailer';
import { secretValue } from './config.js';
import { SUPPORT_EMAIL } from '../shared/contact.js';

export function createMailer({
  production = process.env.NODE_ENV === 'production',
  from = process.env.EMAIL_FROM,
  resendApiKey = secretValue('RESEND_API_KEY'),
  smtpUrl = secretValue('SMTP_URL'),
  log = console.log,
} = {}) {
  if (resendApiKey || smtpUrl) {
    if (!from) throw new Error('EMAIL_FROM is required when an email transport is configured.');
  } else if (production) {
    throw new Error('Production requires RESEND_API_KEY or SMTP_URL, plus EMAIL_FROM.');
  }
  if (resendApiKey) {
    return {
      mode: 'Resend',
      async send({ to, subject, text }) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from, to, subject, text }),
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error(`Email provider responded ${response.status}`);
      },
    };
  }
  if (smtpUrl) {
    const smtp = new URL(smtpUrl);
    if (!['smtp:', 'smtps:'].includes(smtp.protocol) || smtp.search)
      throw new Error('Use an smtp:// or smtps:// URL without query overrides.');
    const secure = smtp.protocol === 'smtps:';
    const transport = nodemailer.createTransport({
      host: smtp.hostname,
      port: Number(smtp.port || (secure ? 465 : 587)),
      secure,
      requireTLS: production && !secure,
      tls: { rejectUnauthorized: true },
      ...(smtp.username
        ? {
            auth: {
              user: decodeURIComponent(smtp.username),
              pass: decodeURIComponent(smtp.password),
            },
          }
        : {}),
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });
    return {
      mode: 'SMTP',
      send: ({ to, subject, text }) => transport.sendMail({ from, to, subject, text }),
    };
  }
  return {
    mode: 'console (development only)',
    async send({ to, subject, text }) {
      log(`\n=== Email to ${to} ===\nSubject: ${subject}\n\n${text}\n=== end of email ===\n`);
    },
  };
}

// Names are typed by whoever signed up, so an email greets someone by name only when it looks
// like a name (letters, spaces, hyphens, apostrophes; no links, digits or "@"). Otherwise the
// caller falls back to "there" or "friend". That keeps anyone from sending a link in our name.
export function greetingName(name) {
  const cleaned = String(name || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const nameLike =
    /^[\p{L}\p{M}][\p{L}\p{M}'’. -]{0,48}$/u.test(cleaned) &&
    !/\.\S/.test(cleaned) &&
    cleaned.split(' ').length <= 4;
  return nameLike ? cleaned : '';
}
// Plain-text messages: they render everywhere and contain nothing an attacker could style.
export const messages = {
  verify: (link) => ({
    subject: 'Confirm your U Stay Fit email address',
    text: `Welcome to U Stay Fit.\n\nConfirm this email address to finish creating your account:\n${link}\n\nThe link works for 24 hours. If you did not sign up, ignore this email and no account will be kept.`,
  }),
  alreadyRegistered: (link) => ({
    subject: 'You already have a U Stay Fit account',
    text: `Someone just tried to create a U Stay Fit account with this email address, but one already exists.\n\nIf that was you, sign in instead. If you forgot your password, you can reset it here:\n${link}\n\nIf it was not you, no action is needed; your account has not changed.`,
  }),
  reset: (link) => ({
    subject: 'Reset your U Stay Fit password',
    text: `A password reset was requested for your U Stay Fit account.\n\nChoose a new password here:\n${link}\n\nThe link works for one hour and can be used once. If you did not request this, ignore this email; your password will stay the same.`,
  }),
  resetNoPassword: () => ({
    subject: 'About your U Stay Fit sign-in',
    text: `A password reset was requested for this email, but this U Stay Fit account signs in with Google or Facebook and has no password.\n\nUse that provider's button on the sign-in page. If you did not request this, no action is needed.`,
  }),
  passwordChanged: () => ({
    subject: 'Your U Stay Fit password was changed',
    text: `The password on your U Stay Fit account was just changed and other sessions were signed out.\n\nIf this was not you, reset your password immediately from the sign-in page.`,
  }),
  // The goodbye: sent whenever an account is deleted. It also confirms the deletion, so it keeps
  // the "if this was not you" line.
  accountDeleted: (name, link) => {
    const who = greetingName(name);
    return {
      subject: who ? `We're sad to see you go, ${who}!` : "We're sad to see you go!",
      text: `Dear ${who || 'friend'},\n\nWe are so sad to see you go!!\n\nYour U Stay Fit account, your plan, and all of your records have now been permanently deleted, just as you asked.\n\nThank you for letting us be a part of your health journey, even for a little while. Every glass of water you logged and every step you took was yours, and that progress goes with you.\n\nWhenever you are ready to start your health journey again, we will be right here, and we would love to see you again:\n${link}\n\nTake good care of yourself.\n\nWith love,\nThe U Stay Fit team\n\nIf you did not delete this account, please write to us right away at ${SUPPORT_EMAIL}.`,
    };
  },
  // Sent once, when an account becomes real: a confirmed email sign-up or a first Google or
  // Facebook sign-in.
  welcome: (name, link) => {
    const who = greetingName(name);
    return {
      subject: who ? `Welcome to U Stay Fit, ${who}!` : 'Welcome to U Stay Fit!',
      text: `Hey, ${who || 'there'}!!!\n\nWe are so glad you trusted us to be a part of your health journey. Welcome to U Stay Fit!\n\nYour space is ready. Build your personal plan, log your meals, water and movement, and watch your progress grow, one small step at a time:\n${link}\n\nA little something to carry with you:\n"You don't have to be extreme, just consistent. Small steps, repeated every day, become the change you are working for."\n\nThere will be busy days and lazy days, and that is okay. Show up for yourself anyway, even if it is only a glass of water or a ten-minute walk. Those are the days that build the habit.\n\nWe are cheering for you.\n\nWith care,\nThe U Stay Fit team`,
    };
  },
  // Account deletion for Google/Facebook accounts (no password to confirm with). The link itself
  // proves the person controls the mailbox, so it works on any device, signed in or not.
  deletionLink: (link) => ({
    subject: 'Delete your U Stay Fit account',
    text: `You asked to delete your U Stay Fit account. Open this link to finish:\n${link}\n\nIt works on any phone or computer, even one where you are not signed in, and it expires in 15 minutes. If you asked more than once, use the newest email: each new link replaces the one before. Opening it does not delete anything by itself: you will be asked to type DELETE on that page first.\n\nIf you did not ask for this, ignore this email and your account will stay exactly as it is.`,
  }),
};
