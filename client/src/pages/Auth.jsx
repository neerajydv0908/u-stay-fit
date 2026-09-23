import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, MailCheck, ShieldCheck, Sprout, KeyRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context';
import { Field, ErrorMessage, Eyebrow, Reveal } from '../components/UI';
import { images } from '../data';

export const authMessages = {
  provider_email_required:
    'Please share an email address with this provider, or sign up with Google or email instead.',
  oauth_failed: 'Social sign-in could not be completed. Please try again or use your password.',
  provider_not_configured:
    'This sign-in option is not available yet. Please use your username and password.',
  use_original_login: 'This email already has an account. Please use your original sign-in method.',
  verify_failed: 'That confirmation link is invalid or has expired. Sign in to request a new one.',
};

export default function Auth({ signup = false }) {
  const { user, profile, setAuth } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [providers, setProviders] = useState({ google: false, facebook: false });
  const [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  // pending: waiting for the email link · mfa: password accepted, code needed · unverified: resend
  const [pending, setPending] = useState(null),
    [mfa, setMfa] = useState(null),
    [unverified, setUnverified] = useState(null),
    [identifier, setIdentifier] = useState('');
  useEffect(() => {
    api('/auth/providers')
      .then(setProviders)
      .catch(() => {});
  }, []);
  useEffect(() => {
    setError('');
    setPending(null);
    setMfa(null);
    setUnverified(null);
  }, [signup]);
  if (user) return <Navigate to={profile ? '/dashboard' : '/onboarding'} replace />;

  function finish(result) {
    setAuth(result);
    navigate(result.profile ? '/dashboard' : '/onboarding', { replace: true });
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if (signup) {
        data.consent = data.consent === 'on';
        setPending(await api('/auth/register', { method: 'POST', body: data }));
        return;
      }
      setIdentifier(data.identifier);
      const result = await api('/auth/login', { method: 'POST', body: data });
      if (result.pending) setPending(result);
      else if (result.mfaRequired) setMfa({ token: result.mfaToken });
      else finish(result);
    } catch (err) {
      if (err.data?.unverified) setUnverified({ error: err.message });
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function submitCode(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { code } = Object.fromEntries(new FormData(event.currentTarget));
      finish(await api('/auth/mfa', { method: 'POST', body: { mfaToken: mfa.token, code } }));
    } catch (err) {
      setError(err.message);
      if (err.data?.restart) setMfa(null);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setError('');
    try {
      const result = await api('/auth/resend-verification', {
        method: 'POST',
        body: { identifier },
      });
      setUnverified({ sent: true, devLink: result.devLink });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container auth-layout">
      <Reveal className="auth-story">
        <img src={images.food} alt="A fresh, balanced meal in a ceramic bowl" />
        <div>
          <span className="story-icon">
            <Sprout size={30} />
          </span>
          <h2>
            A little care.
            <br />A whole new chapter.
          </h2>
          <p>Your goals deserve a plan that feels like you.</p>
        </div>
      </Reveal>
      <Reveal className="auth-form-wrap">
        {pending ? (
          <div className="auth-notice">
            <span className="story-icon">
              <MailCheck size={30} />
            </span>
            <Eyebrow>{pending.created ? 'WELCOME' : 'ONE MORE STEP'}</Eyebrow>
            <h1>Check your inbox.</h1>
            <p>
              {pending.created
                ? 'There was no account for that email yet, so we created one for you. '
                : ''}
              We sent a confirmation link to <strong>{pending.email}</strong>. Open it within 24
              hours to finish setting up your account. If it does not arrive, check your spam folder
              or sign in again to request a new link.
            </p>
            {pending.created && (
              <p className="small muted">
                We picked a name and username from your email address; you can change both under
                Account & security once you are in.
              </p>
            )}
            {pending.devLink && (
              <p className="dev-link">
                Development mode: no email service is configured, so the link was printed in the
                server terminal. <a href={pending.devLink}>Open the confirmation link</a>
              </p>
            )}
            <Link className="button" to="/login">
              Go to sign in <ArrowRight size={18} />
            </Link>
          </div>
        ) : mfa ? (
          <form onSubmit={submitCode} className="form-stack auth-notice" key="mfa">
            <span className="story-icon">
              <KeyRound size={30} />
            </span>
            <Eyebrow>TWO-FACTOR AUTHENTICATION</Eyebrow>
            <h1>One more check.</h1>
            <p>
              Enter the 6-digit code from your authenticator app, or one of your recovery codes.
            </p>
            <Field
              label="Code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123 456"
              required
              minLength={6}
              maxLength={20}
              autoFocus
            />
            <ErrorMessage>{error}</ErrorMessage>
            <button className="button full-width" disabled={busy}>
              {busy ? 'Checking…' : 'Continue'}
              <ArrowRight size={18} />
            </button>
            <button type="button" className="text-link" onClick={() => setMfa(null)}>
              Start over
            </button>
          </form>
        ) : (
          <>
            <Eyebrow>YOUR NEXT SMALL STEP</Eyebrow>
            <h1>{signup ? 'Let’s grow together.' : 'Good to see you.'}</h1>
            <p>
              {signup
                ? 'Create your account. Find your rhythm.'
                : 'Come on in. New here? Enter your email and a password and we will set you up.'}
            </p>
            <div className="social-buttons">
              <button
                className="button secondary"
                disabled={!providers.google}
                onClick={() => window.location.assign('/api/auth/google')}
              >
                <span className="google-mark">G</span>Continue with Google
              </button>
              <button
                className="button secondary"
                disabled={!providers.facebook}
                onClick={() => window.location.assign('/api/auth/facebook')}
              >
                <span className="facebook-mark">f</span>Continue with Facebook
              </button>
            </div>
            {(!providers.google || !providers.facebook) && (
              <p className="social-note">
                Unavailable social options are shown dimmed. You can use your{' '}
                {signup ? 'email' : 'username and password'} below.
              </p>
            )}
            <div className="divider">
              <span>or {signup ? 'make yourself at home' : 'sign in with your account'}</span>
            </div>
            <form onSubmit={submit} className="form-stack" key={signup ? 'signup' : 'login'}>
              {signup && (
                <>
                  <Field
                    label="What should we call you?"
                    name="name"
                    autoComplete="name"
                    placeholder="Your first name"
                    required
                    minLength={2}
                    maxLength={70}
                  />
                  <div className="form-grid">
                    <Field
                      label="Username"
                      name="username"
                      autoComplete="username"
                      placeholder="your_username"
                      pattern="[A-Za-z0-9_]{3,30}"
                      title="3–30 letters, numbers, or underscores"
                      required
                    />
                    <Field
                      label="Email address"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                      maxLength={254}
                    />
                  </div>
                </>
              )}
              {!signup && (
                <Field
                  label="Email or username"
                  name="identifier"
                  autoComplete="username"
                  placeholder="you@example.com"
                  required
                  hint="No account yet? Use your email address and a password of at least 12 characters, and we will create one."
                />
              )}
              <label className="field">
                <span>Password</span>
                <div className="password-field">
                  <input
                    name="password"
                    type={show ? 'text' : 'password'}
                    autoComplete={signup ? 'new-password' : 'current-password'}
                    placeholder={signup ? 'A memorable phrase, 12+ characters' : 'Your password'}
                    required
                    minLength={signup ? 12 : 1}
                    maxLength={128}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={show ? 'Hide password' : 'Show password'}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {signup && (
                  <small>
                    At least 12 characters. Longer phrases are easier to remember. Passwords found
                    in known data breaches are refused.
                  </small>
                )}
              </label>
              {signup && (
                <label className="checkbox-label compact">
                  <input type="checkbox" name="consent" required />
                  <span>
                    I have read the <Link to="/privacy">privacy notice</Link> and understand that U
                    Stay Fit stores my account details and, once I create a plan, my measurements
                    and daily records.
                  </span>
                </label>
              )}
              {!signup && (
                <>
                  <Link to="/forgot-password" className="text-link forgot-link">
                    Forgot your password?
                  </Link>
                  <p className="small muted consent-line">
                    By continuing with a new email you agree to the{' '}
                    <Link to="/privacy">privacy notice</Link>.
                  </p>
                </>
              )}
              <ErrorMessage>{error || authMessages[search.get('error')]}</ErrorMessage>
              {unverified && (
                <div className="note" role="status">
                  <MailCheck size={18} />
                  <p>
                    {unverified.sent
                      ? 'If that account is still waiting for confirmation, a new link is on its way. Check your inbox and spam folder.'
                      : unverified.error}{' '}
                    {!unverified.sent && (
                      <button
                        type="button"
                        className="inline-link"
                        onClick={resend}
                        disabled={busy}
                      >
                        Send a new confirmation link
                      </button>
                    )}
                    {unverified.devLink && (
                      <>
                        {' '}
                        <a href={unverified.devLink}>Development: open the link</a>
                      </>
                    )}
                  </p>
                </div>
              )}
              <button className="button full-width" disabled={busy}>
                {busy ? 'One moment…' : signup ? 'Create my account' : 'Back to my journey'}
                <ArrowRight size={18} />
              </button>
            </form>
            <p className="auth-switch">
              {signup ? 'Already part of the family? ' : 'Prefer to choose your own username? '}
              <Link to={signup ? '/login' : '/signup'}>
                {signup ? 'Sign in' : 'Use the full sign-up form'}
              </Link>
            </p>
            <p className="privacy-note">
              <ShieldCheck size={15} />
              Your records are private to your account. <Link to="/privacy">Privacy details</Link>
            </p>
          </>
        )}
      </Reveal>
    </div>
  );
}
