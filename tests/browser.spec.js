import { test, expect } from '@playwright/test';
import { totpCode, timeStep } from '../server/totp.js';

const passphrase = 'Test-only-long-passphrase-2026';
const newPassphrase = 'Another-test-passphrase-2026';
// Development links use APP_ORIGIN (localhost); the test browses 127.0.0.1, so follow the path
// only and the session cookie stays on one host, as it would for a real emailed link.
async function openDevLink(page, name) {
  const href = await page.getByRole('link', { name }).getAttribute('href');
  const url = new URL(href);
  await page.goto(url.pathname + url.search);
}

test('public pages, navigation, and no horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A healthier rhythm/ })).toBeVisible();
  await page.goto('/fat-loss');
  await expect(page.getByRole('heading', { name: /Less pressure/ })).toBeVisible();
  await page.goto('/muscle-gain');
  await expect(page.getByRole('heading', { name: /Strength grows/ })).toBeVisible();
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: /Privacy & your data/ })).toBeVisible();
  await page.goto('/special-note');
  await expect(page.getByRole('heading', { name: /For the love of my life/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Contact us reaches the footer in one click from another page; myths scroll sideways', async ({
  page,
  isMobile,
}) => {
  // Coming from a shorter page used to stop halfway down the home page on the first click.
  await page.goto('/fat-loss');
  if (isMobile) await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('link', { name: 'Contact us' }).click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () => Math.abs(scrollY + innerHeight - document.documentElement.scrollHeight) <= 2,
        ),
      { timeout: 5000 },
    )
    .toBe(true);
  await expect(page.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
    'href',
    'https://www.instagram.com/ustay_fit_0916/',
  );
  await expect(page.getByRole('link', { name: /Twitter \/ X/ })).toHaveAttribute(
    'href',
    'https://x.com/Ustayfit0916',
  );

  await page.goto('/');
  const track = page.getByRole('region', { name: /diet myths/ });
  await expect(track.locator('article')).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Previous myths' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByRole('button', { name: 'Next myths' }).click();
  await expect.poll(() => track.evaluate((row) => row.scrollLeft)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Previous myths' })).toHaveAttribute(
    'aria-disabled',
    'false',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('sign up, confirm email, build a plan, log records, secure the account, and recover it', async ({
  page,
}) => {
  test.setTimeout(120000);
  const identity = `browser_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const email = `${identity}@example.com`;

  // ---- Registration ends on a "check your inbox" screen; in development the link is shown.
  await page.goto('/signup');
  await page.getByLabel('What should we call you?').fill('Browser Tester');
  await page.getByLabel('Username', { exact: true }).fill(identity);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('textbox', { name: /Password/ }).fill(passphrase);
  await page.getByRole('checkbox', { name: /privacy notice/ }).check();
  await page.getByRole('button', { name: 'Create my account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  // Signing in before confirming is refused with a way to resend the link.
  await page.getByRole('link', { name: 'Go to sign in' }).click();
  await page.getByLabel('Email or username').fill(identity);
  await page.getByRole('textbox', { name: /Password/ }).fill(passphrase);
  await page.getByRole('button', { name: 'Back to my journey' }).click();
  await expect(page.getByText(/confirm your email address first/i)).toBeVisible();
  await page.getByRole('button', { name: 'Send a new confirmation link' }).click();
  await openDevLink(page, 'Development: open the link');

  await page.getByRole('button', { name: 'Confirm my email' }).click();

  // ---- The confirmation page signs the person in and sends them to onboarding.
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole('button', { name: /Woman exercising in a gym Female/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Woman being active Fat loss/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Height (cm)', { exact: true }).fill('170');
  await page.getByLabel('Weight (kg)', { exact: true }).fill('75');
  await page.getByLabel('Age (years)', { exact: true }).fill('30');
  await expect(page.getByText(/Deurenberg estimate/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Lightly active/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('checkbox', { name: /I’m an adult/ }).check();
  await page.getByRole('checkbox', { name: /I consent to U Stay Fit storing/ }).check();
  await page.getByRole('button', { name: 'Meet my dashboard' }).click();
  await expect(page.getByRole('button', { name: /Hey, Browser/ })).toBeVisible();

  // ---- Daily records.
  await page.getByRole('button', { name: 'Log food', exact: true }).click();
  await page
    .getByLabel('Start with an idea (optional)')
    .selectOption({ label: 'Rajma Chawal · 520 kcal' });
  await expect(page.getByLabel('Food / meal name')).toHaveValue('Rajma Chawal');
  await page.getByRole('button', { name: 'Save this small step' }).click();
  await expect(page.getByText('Rajma Chawal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Log water', exact: true }).click();
  await page.getByRole('button', { name: 'Save this small step' }).click();
  await expect(page.getByText('250 ml', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Rajma Chawal', { exact: true })).toBeVisible();
  await expect(page.getByText('250 ml', { exact: true })).toBeVisible();

  // ---- Account & security: password change, two-factor with a real code, recovery codes.
  await page.getByRole('button', { name: /Hey, Browser/ }).click();
  await page.getByRole('link', { name: 'Account & security' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText('confirmed', { exact: true })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download my records (PDF)' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('u-stay-fit-records.pdf');
  await page.getByLabel('Current password').first().fill(passphrase);
  await page.getByLabel('New password').fill(newPassphrase);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText(/Password updated/)).toBeVisible();
  await page.getByLabel('Current password').last().fill(newPassphrase);
  await page.getByRole('button', { name: 'Set up two-factor authentication' }).click();
  await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible();
  await page.getByText('Can’t scan? Enter the key manually').click();
  const secret = (await page.locator('.totp-setup code').innerText()).trim();
  await page.getByLabel('6-digit code').fill(totpCode(secret, timeStep()));
  await page.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  const recoveryCodes = await page.locator('.recovery-codes code').allTextContents();
  const recoveryCode = recoveryCodes[0].trim();
  await page.getByRole('button', { name: 'I’ve saved them' }).click();
  await expect(page.getByText('ON', { exact: true })).toBeVisible();

  // ---- Sign out everywhere, then sign in again through the two-factor step.
  await page.getByRole('button', { name: 'Sign out everywhere' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email or username').fill(email);
  await page.getByRole('textbox', { name: /Password/ }).fill(newPassphrase);
  await page.getByRole('button', { name: 'Back to my journey' }).click();
  await expect(page.getByRole('heading', { name: 'One more check.' })).toBeVisible();
  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText(/That code is not valid/)).toBeVisible();
  await page.getByLabel('Code').fill(recoveryCode);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: /Hey, Browser/ })).toBeVisible();

  // ---- Forgotten password: the reset revokes sessions; the person signs in with password AND a second factor.
  await page.getByRole('button', { name: /Hey, Browser/ }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await openDevLink(page, 'Open the reset link');
  await expect(page.getByRole('heading', { name: 'Choose a new password.' })).toBeVisible();
  await page.getByLabel('New password').fill(passphrase);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await page.getByRole('link', { name: 'Go to sign in' }).click();
  await page.getByLabel('Email or username').fill(email);
  await page.getByRole('textbox', { name: /Password/ }).fill(passphrase);
  await page.getByRole('button', { name: 'Back to my journey' }).click();
  await expect(page.getByRole('heading', { name: 'One more check.' })).toBeVisible();
  await page.getByLabel('Code').fill(recoveryCodes[1].trim());
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: /Hey, Browser/ })).toBeVisible();

  // ---- Deleting the account removes access entirely.
  await page.goto('/account');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByLabel('Your password').fill(passphrase);
  await page
    .getByRole('dialog')
    .getByLabel('Authenticator or recovery code')
    .fill(recoveryCodes[2].trim());
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);

  // ---- Signing in with an email that has no account simply creates one (no sign-up form needed).
  await page.getByLabel('Email or username').fill(email);
  await page.getByRole('textbox', { name: /Password/ }).fill(passphrase);
  await page.getByRole('button', { name: 'Back to my journey' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  await expect(page.getByText(/we created one for you/)).toBeVisible();
  await openDevLink(page, 'Open the confirmation link');
  await page.getByRole('button', { name: 'Confirm my email' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  // The name and username picked from the address can be changed on the account page.
  await page.goto('/account');
  await expect(page.getByText(`@${identity}`)).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Renamed Tester');
  await page.getByLabel('Username', { exact: true }).fill(`${identity}_new`);
  await page.locator('.details-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Name and username updated/)).toBeVisible();
  await expect(page.getByText('Renamed Tester', { exact: true })).toBeVisible();
  await expect(page.getByText(`@${identity}_new`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
