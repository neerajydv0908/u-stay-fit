// /delete-account?token=…  reached from the deletion email sent to Google/Facebook accounts.
// It works on any device, signed in or not: the emailed token is the proof of ownership.
// Like the other emailed links, the token is only sent with POST after the person types DELETE,
// so a mail scanner that merely opens the link cannot delete anything.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Heart, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context';
import { Eyebrow, Field, ErrorMessage } from '../components/UI';

export default function DeleteAccount() {
  const { setAuth } = useAuth();
  const [search] = useSearchParams();
  const token = search.get('token') || '';
  const [done, setDone] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { confirm } = Object.fromEntries(new FormData(event.currentTarget));
      await api('/account/delete-by-email', { method: 'POST', body: { token, confirm } });
      setDone(true);
      // If this browser was signed in to the deleted account, the server has signed it out.
      api('/me')
        .then(setAuth)
        .catch(() => setAuth({ user: null, profile: null, plan: null }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container simple-page recovery-page">
      <span className="story-icon">{done ? <Heart size={30} /> : <Trash2 size={30} />}</span>
      <Eyebrow>ACCOUNT DELETION</Eyebrow>
      {done ? (
        <>
          <h1>Your account has been deleted.</h1>
          <p>
            Your U Stay Fit account, plan, and records are gone for good, and a confirmation email
            is on its way. Thank you for letting us be a small part of your journey. We wish you
            well.
          </p>
          <Link className="button" to="/">
            Back to home <ArrowRight size={18} />
          </Link>
        </>
      ) : !token ? (
        <>
          <h1>This link is incomplete.</h1>
          <p>
            Open the full link from the email, or request a new one under Account & security →
            Delete my account.
          </p>
          <Link className="button" to="/account">
            Go to Account & security <ArrowRight size={18} />
          </Link>
        </>
      ) : (
        <>
          <h1>Delete your account?</h1>
          <form onSubmit={submit} className="form-stack">
            <p>
              This permanently deletes your U Stay Fit account and everything in it: your plan and
              your food, water, exercise, and weight records. It cannot be undone. If you want a
              copy, sign in and download your records first.
            </p>
            <Field
              label="Type DELETE to confirm"
              name="confirm"
              placeholder="DELETE"
              required
              pattern="DELETE"
              autoComplete="off"
            />
            <ErrorMessage>{error}</ErrorMessage>
            <button className="button danger" disabled={busy}>
              {busy ? 'Deleting…' : 'Delete my account forever'}
              <Trash2 size={17} />
            </button>
            <Link to="/" className="text-link">
              Keep my account
            </Link>
          </form>
        </>
      )}
    </div>
  );
}
