// One small mail abstraction with three transports:
//   RESEND_API_KEY  → Resend's HTTP API (no extra dependency)
//   SMTP_URL        → any SMTP provider through nodemailer (smtps://user:pass@host:465)
//   neither         → development only: messages are printed to the server console
// Production refuses to start without a real transport, because verification and password
// reset depend on email actually being delivered.
import nodemailer from 'nodemailer';
import { secretValue } from './config.js';

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
  accountDeleted: () => ({
    subject: 'Your U Stay Fit account was deleted',
    text: `Your U Stay Fit account, plan, and records have been permanently deleted as requested.\n\nIf this was not you, please contact the operator listed on the privacy page.`,
  }),
};
