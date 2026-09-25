import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context';
import { Eyebrow, Field, ErrorMessage, Modal } from '../components/UI';

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

export default function Account() {
  const { user, setAuth } = useAuth();
  const [account, setAccount] = useState(null),
    [toast, setToast] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const [setup, setSetup] = useState(null), // { secret, otpauth, qr }
    [recoveryCodes, setRecoveryCodes] = useState(null),
    [disabling, setDisabling] = useState(false),
    [deleting, setDeleting] = useState(false),
    // Google/Facebook accounts are deleted from an emailed link (see /delete-account).
    [deletionSentTo, setDeletionSentTo] = useState(''),
    [deletionDevLink, setDeletionDevLink] = useState(''),
    [editing, setEditing] = useState(false);
  async function load() {
    try {
      setAccount(await api('/account'));
      const me = await api('/me');
      setAuth(me);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
    if (new URLSearchParams(window.location.search).get('error') === 'reauth_failed')
      setError('Identity confirmation failed. Try again with your linked account.');
    if (new URLSearchParams(window.location.search).get('reauth') === 'ok') {
      setDeleting(true);
      setToast('Identity confirmed. You can now finish deleting your account.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  // Runs one account action, surfaces its error, and refreshes the summary afterwards
  // (unless the action ends the session, in which case there is nothing left to load).
  async function act(name, work, done, { reload = true } = {}) {
    setBusy(name);
    setError('');
    try {
      const result = await work();
      if (reload) await load();
      done?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }
  const saveDetails = (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    act(
      'details',
      () => api('/account/details', { method: 'POST', body }),
      () => {
        setEditing(false);
        setToast('Name and username updated.');
      },
    );
  };
  const changePassword = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    act(
      'password',
      () =>
        api('/account/password', { method: 'POST', body: Object.fromEntries(new FormData(form)) }),
      () => {
        form.reset();
        setToast('Password updated. Other devices have been signed out.');
      },
    );
  };
  const signOutEverywhere = () =>
    act(
      'sessions',
      () => api('/auth/logout-all', { method: 'POST', body: {} }),
      // A full page load clears every in-memory trace of the account.
      () => window.location.assign('/login'),
      { reload: false },
    );
  const startSetup = (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    act('setup', () => api('/account/totp/setup', { method: 'POST', body }), setSetup);
  };
  const enable = (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    act(
      'enable',
      () => api('/account/totp/enable', { method: 'POST', body }),
      (result) => {
        setSetup(null);
        setRecoveryCodes(result.recoveryCodes);
      },
    );
  };
  const regenerate = (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    act(
      'codes',
      () => api('/account/totp/recovery-codes', { method: 'POST', body }),
      (result) => setRecoveryCodes(result.recoveryCodes),
    );
  };
  const disable = (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    act(
      'disable',
      () => api('/account/totp/disable', { method: 'POST', body }),
      () => {
        setDisabling(false);
        setToast('Two-factor authentication is off.');
      },
    );
  };
  const sendDeletionLink = () =>
    act(
      'delete-link',
      () => api('/account/deletion-confirmation', { method: 'POST', body: {} }),
      (result) => {
        setDeletionSentTo(result.email || user.email);
        setDeletionDevLink(result.devLink || '');
      },
      { reload: false },
    );
  const remove = (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    act(
      'delete',
      () => api('/account', { method: 'DELETE', body }),
      () => window.location.assign('/'),
      { reload: false },
    );
  };
  const factorField = user.twoFactorEnabled && (
    <Field
      label="Authenticator or recovery code"
      name="code"
      autoComplete="one-time-code"
      required
      maxLength={20}
      hint="Use a fresh code for each security change. Each code works once."
    />
  );
  const passwordField = (
    <Field
      label="Current password"
      name="password"
      type="password"
      autoComplete="current-password"
      required
      maxLength={128}
    />
  );
  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setToast('Recovery codes copied.');
    } catch {
      setToast('Copying is not available here; write the codes down instead.');
    }
  }

  return (
    <div className="container account-page">
      <div className="onboarding-top">
        <Link to="/dashboard" className="text-link">
          <ArrowLeft size={16} />
          Back to dashboard
        </Link>
        <span>{user.email || `@${user.username}`}</span>
      </div>
      <div className="onboarding-heading">
        <Eyebrow>ACCOUNT & SECURITY</Eyebrow>
        <h1>Your account, in your hands.</h1>
        <p>Keep your sign-in safe, and take your records with you or remove them at any time.</p>
      </div>
      <ErrorMessage>{error}</ErrorMessage>

      <div className="account-grid">
        <section className="panel">
          <div className="card-heading">
            <h2>
              <UserRound size={19} /> Overview
            </h2>
          </div>
          {editing ? (
            <form onSubmit={saveDetails} className="form-stack details-form">
              <div className="form-grid">
                <Field
                  label="Name"
                  name="name"
                  defaultValue={user.name}
                  required
                  minLength={2}
                  maxLength={70}
                  autoComplete="name"
                />
                <Field
                  label="Username"
                  name="username"
                  defaultValue={user.username}
                  required
                  pattern="[A-Za-z0-9_]{3,30}"
                  title="3–30 letters, numbers, or underscores"
                  autoComplete="username"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button className="button" disabled={busy === 'details'}>
                  {busy === 'details' ? 'Saving…' : 'Save'}
                  <Check size={17} />
                </button>
              </div>
            </form>
          ) : null}
          <dl className="account-facts">
            <div>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Username</dt>
              <dd>
                @{user.username}
                {!editing && (
                  <button
                    type="button"
                    className="inline-link edit-link"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                {user.email || 'None (social sign-in)'}
                {user.email && (
                  <small className={user.emailVerified ? 'ok' : ''}>
                    {user.emailVerified ? 'confirmed' : 'not confirmed'}
                  </small>
                )}
              </dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{formatDate(user.createdAt)}</dd>
            </div>
            <div>
              <dt>Consent recorded</dt>
              <dd>{formatDate(user.consentedAt)}</dd>
            </div>
            <div>
              <dt>Signed-in devices</dt>
              <dd>{account ? account.activeSessions : '—'}</dd>
            </div>
          </dl>
          <button
            className="button secondary"
            onClick={signOutEverywhere}
            disabled={busy === 'sessions'}
          >
            <LogOut size={17} />
            {busy === 'sessions' ? 'Signing out…' : 'Sign out everywhere'}
          </button>
          <p className="small muted">
            Ends every session, including this one. Use it if you signed in on a shared computer.
          </p>
        </section>

        <section className="panel">
          <div className="card-heading">
            <h2>
              <KeyRound size={19} /> Password
            </h2>
          </div>
          {user.hasPassword ? (
            <form onSubmit={changePassword} className="form-stack">
              <Field
                label="Current password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
              <Field
                label="New password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                hint="At least 12 characters. Passwords found in known breaches are refused."
              />
              {factorField}
              <button className="button" disabled={busy === 'password'}>
                {busy === 'password' ? 'Saving…' : 'Change password'}
                <Check size={17} />
              </button>
              <p className="small muted">
                Last changed:{' '}
                {formatDate(account?.passwordChangedAt) === '—'
                  ? 'never'
                  : formatDate(account?.passwordChangedAt)}
                . Changing it signs out every other device.
              </p>
            </form>
          ) : (
            <p className="muted">
              This account signs in with Google or Facebook, so there is no password here. Manage
              sign-in security with that provider.
            </p>
          )}
        </section>

        <section className="panel">
          <div className="card-heading">
            <h2>
              <Smartphone size={19} /> Two-factor authentication
            </h2>
            <span>{user.twoFactorEnabled ? 'ON' : 'OFF'}</span>
          </div>
          {!user.hasPassword ? (
            <p className="muted">
              Manage two-step verification in your Google or Facebook account. Turn it on there to
              protect provider sign-ins.
            </p>
          ) : user.twoFactorEnabled ? (
            <>
              <p className="muted">
                Signing in with your password also asks for a 6-digit code from your authenticator
                app. {account ? `${account.recoveryCodesLeft} recovery codes` : 'Recovery codes'}{' '}
                remain for when the app is unavailable.
              </p>
              <form onSubmit={regenerate} className="inline-form">
                {passwordField}
                {factorField}
                <button className="button secondary" disabled={busy === 'codes'}>
                  {busy === 'codes' ? 'Working…' : 'Regenerate'}
                </button>
              </form>
              {disabling ? (
                <form onSubmit={disable} className="inline-form">
                  <Field
                    label="Confirm with your password to turn it off"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                  {factorField}
                  <button className="button" disabled={busy === 'disable'}>
                    {busy === 'disable' ? 'Turning off…' : 'Turn off'}
                  </button>
                </form>
              ) : (
                <button className="text-link" onClick={() => setDisabling(true)}>
                  Turn off two-factor authentication
                </button>
              )}
            </>
          ) : setup ? (
            <form onSubmit={enable} className="totp-setup">
              <p className="muted">
                Scan this code with an authenticator app (such as Google Authenticator, Authy, or
                1Password), then enter the 6-digit code it shows.
              </p>
              <img src={setup.qr} alt="QR code for your authenticator app" className="qr" />
              <details>
                <summary>Can’t scan? Enter the key manually</summary>
                <code>{setup.secret}</code>
              </details>
              <Field
                label="6-digit code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                required
                pattern="\d{6}"
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setSetup(null)}>
                  Cancel
                </button>
                <button className="button" disabled={busy === 'enable'}>
                  {busy === 'enable' ? 'Checking…' : 'Turn on'}
                  <ShieldCheck size={17} />
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="muted">
                Add a second step to password sign-ins: a code from an authenticator app on your
                phone. Even someone who learns your password cannot get in without it.
              </p>
              <form onSubmit={startSetup} className="form-stack">
                {passwordField}
                <button className="button" disabled={busy === 'setup'}>
                  {busy === 'setup' ? 'Preparing…' : 'Set up two-factor authentication'}
                  <ShieldCheck size={17} />
                </button>
              </form>
            </>
          )}
        </section>

        <section className="panel">
          <div className="card-heading">
            <h2>
              <Download size={19} /> Your data
            </h2>
          </div>
          <p className="muted">
            Download everything stored for this account as a PDF report, or delete the account and
            every record with it. Deletion from the live database is immediate. Encrypted backups
            expire under the retention policy.
          </p>
          <a href="/api/export/pdf" download className="button secondary">
            <Download size={17} />
            Download my records (PDF)
          </a>
          <p className="small muted">
            Need it as data instead?{' '}
            <a href="/api/export" download className="inline-link">
              Download the JSON copy
            </a>{' '}
            (machine-readable, for moving to another app).
          </p>
          <button className="text-link danger" onClick={() => setDeleting(true)}>
            <Trash2 size={16} />
            Delete my account
          </button>
          <p className="small muted">
            Questions about your data? See the <Link to="/privacy">privacy notice</Link>{' '}
            <ArrowUpRight size={13} />
          </p>
        </section>
      </div>

      <Modal
        open={Boolean(recoveryCodes)}
        onClose={() => setRecoveryCodes(null)}
        title="Save your recovery codes"
      >
        <p>
          Each code signs you in once if you lose your authenticator app. Store them somewhere safe;
          they are shown only now.
        </p>
        <ul className="recovery-codes">
          {(recoveryCodes || []).map((code) => (
            <li key={code}>
              <code>{code}</code>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="button secondary" onClick={copyCodes}>
            <Copy size={16} /> Copy
          </button>
          <button className="button" onClick={() => setRecoveryCodes(null)}>
            I’ve saved them <Check size={17} />
          </button>
        </div>
      </Modal>
      <Modal open={deleting} onClose={() => setDeleting(false)} title="Delete this account?">
        {!user.hasPassword && !account?.recentlyReauthenticated ? (
          // No password to confirm with: the emailed link proves the mailbox belongs to you.
          <div className="form-stack">
            <p>
              Your plan, food, water, exercise, and weight records will be permanently deleted.
              Download your records first if you want to keep them.
            </p>
            <p>
              This account signs in with Google or Facebook, so there is no password to confirm
              with. We will email a one-time deletion link to <strong>{user.email}</strong>. Open it
              on any phone or computer, type DELETE, and the account is gone. The link expires in 15
              minutes.
            </p>
            {deletionSentTo && (
              <p className="dev-link" role="status">
                Sent to <strong>{deletionSentTo}</strong>. Check your inbox and spam folder, then
                follow the link. If you send it again, only the newest link works. You can close
                this window.
              </p>
            )}
            {deletionDevLink && (
              <p className="dev-link">
                Development mode: <a href={deletionDevLink}>open the deletion link</a>
              </p>
            )}
            <ErrorMessage>{error}</ErrorMessage>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setDeleting(false)}>
                Keep my account
              </button>
              <button
                type="button"
                className="button danger"
                disabled={Boolean(busy)}
                onClick={sendDeletionLink}
              >
                {busy === 'delete-link'
                  ? 'Sending…'
                  : deletionSentTo
                    ? 'Send the link again'
                    : 'Email me a deletion link'}
                <Mail size={16} />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={remove} className="form-stack">
            <p>
              Your plan, food, water, exercise, and weight records will be permanently deleted.
              Download your records first if you want to keep them.
            </p>
            {user.hasPassword && (
              <Field
                label="Your password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            )}
            {factorField}
            <ErrorMessage>{error}</ErrorMessage>
            <Field
              label="Type DELETE to confirm"
              name="confirm"
              placeholder="DELETE"
              required
              pattern="DELETE"
              autoComplete="off"
            />
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setDeleting(false)}>
                Keep my account
              </button>
              <button className="button danger" disabled={busy === 'delete'}>
                {busy === 'delete' ? 'Deleting…' : 'Delete everything'}
                <Trash2 size={16} />
              </button>
            </div>
          </form>
        )}
      </Modal>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
