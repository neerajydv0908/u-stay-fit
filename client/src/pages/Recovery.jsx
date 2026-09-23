// Three small pages reached from emailed links or the sign-in page:
//   /verify?token=…          confirm a new account's email address
//   /forgot-password         ask for a reset link
//   /reset-password?token=…  choose a new password
// Tokens are submitted with POST when the person acts, so a mail scanner that merely opens
// the link cannot use it up.
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, MailCheck, KeyRound, ShieldCheck, LoaderCircle } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context';
import { Eyebrow, Field, ErrorMessage } from '../components/UI';

export default function Recovery({ mode }) {
  const { setAuth } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const token = search.get('token') || '';
  const [state, setState] = useState('idle'),
    [error, setError] = useState(''),
    [devLink, setDevLink] = useState(''),
    [busy, setBusy] = useState(false);
  const finish = (result) => {
    setAuth(result);
    navigate(result.profile ? '/dashboard' : '/onboarding', { replace: true });
  };
  async function verify() {
    setState('working');
    setError('');
    try {
      finish(await api('/auth/verify', { method: 'POST', body: { token } }));
    } catch (err) {
      setState('failed');
      setError(err.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if (mode === 'forgot') {
        const result = await api('/auth/forgot-password', { method: 'POST', body: data });
        setDevLink(result.devLink || '');
        setState('sent');
      } else {
        await api('/auth/reset-password', { method: 'POST', body: { ...data, token } });
        setAuth({ user: null, profile: null, plan: null });
        setState('reset-done');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container simple-page recovery-page">
      {mode === 'verify' && (
        <>
          <span className="story-icon">
            {state === 'working' ? (
              <LoaderCircle className="spin" size={30} />
            ) : (
              <MailCheck size={30} />
            )}
          </span>
          <Eyebrow>EMAIL CONFIRMATION</Eyebrow>
          <h1>{state === 'working' ? 'Confirming your email…' : 'Confirm your email.'}</h1>
          {state === 'idle' && (
            <button className="button" onClick={verify} disabled={!token}>
              Confirm my email <MailCheck size={18} />
            </button>
          )}
          {state === 'working' ? (
            <p>One moment. You will be taken to your plan as soon as the address is confirmed.</p>
          ) : state === 'failed' ? (
            <>
              <ErrorMessage>{error}</ErrorMessage>
              <p>
                Confirmation links work once and expire after 24 hours. Sign in with your username
                and password to request a fresh one.
              </p>
              <Link className="button" to="/login">
                Go to sign in <ArrowRight size={18} />
              </Link>
            </>
          ) : null}
        </>
      )}
      {mode === 'forgot' && (
        <>
          <span className="story-icon">
            <KeyRound size={30} />
          </span>
          <Eyebrow>PASSWORD RESET</Eyebrow>
          <h1>{state === 'sent' ? 'Check your inbox.' : 'Forgot your password?'}</h1>
          {state === 'sent' ? (
            <>
              <p>
                If an account exists for that address, a reset link is on its way. It works for one
                hour. If nothing arrives, check your spam folder or try the address you signed up
                with.
              </p>
              {devLink && (
                <p className="dev-link">
                  Development mode: the link was printed in the server terminal.{' '}
                  <a href={devLink}>Open the reset link</a>
                </p>
              )}
              <Link className="button" to="/login">
                Back to sign in <ArrowRight size={18} />
              </Link>
            </>
          ) : (
            <form onSubmit={submit} className="form-stack">
              <p>
                Enter the email address on your account and we will send a link to choose a new
                password. Accounts that sign in with Google or Facebook have no password to reset.
              </p>
              <Field
                label="Email address"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
              />
              <ErrorMessage>{error}</ErrorMessage>
              <button className="button" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'}
                <ArrowRight size={18} />
              </button>
              <Link to="/login" className="text-link">
                Back to sign in
              </Link>
            </form>
          )}
        </>
      )}
      {mode === 'reset' && (
        <>
          <span className="story-icon">
            <ShieldCheck size={30} />
          </span>
          <Eyebrow>PASSWORD RESET</Eyebrow>
          <h1>Choose a new password.</h1>
          {state === 'reset-done' ? (
            <>
              <p>
                Your password was changed. Sign in with the new password and your two-factor code,
                if enabled.
              </p>
              <Link className="button" to="/login">
                Go to sign in <ArrowRight size={18} />
              </Link>
            </>
          ) : !token ? (
            <>
              <p>This reset link is incomplete. Open the full link from the email.</p>
              <Link className="button" to="/forgot-password">
                Request a new link <ArrowRight size={18} />
              </Link>
            </>
          ) : (
            <form onSubmit={submit} className="form-stack">
              <p>
                Pick something memorable and at least 12 characters long. Every other device will be
                signed out once it is saved.
              </p>
              <Field
                label="New password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <ErrorMessage>{error}</ErrorMessage>
              <button className="button" disabled={busy}>
                {busy ? 'Saving…' : 'Save new password'}
                <ArrowRight size={18} />
              </button>
              <Link to="/forgot-password" className="text-link">
                Need a fresh link?
              </Link>
            </form>
          )}
        </>
      )}
    </div>
  );
}
