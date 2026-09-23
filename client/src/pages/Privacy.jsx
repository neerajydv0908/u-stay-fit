import { Link } from 'react-router-dom';
import { operator, photosSelfHosted } from '../data';

// The operator details come from client/src/data.js. Until they are filled in, the page says so
// plainly instead of pretending a contact exists.
const Placeholder = ({ children }) => <em className="placeholder">{children}</em>;

export default function Privacy() {
  return (
    <div className="container simple-page privacy-page">
      <h1>Privacy & your data.</h1>
      <p>
        U Stay Fit is operated by{' '}
        {operator.name ? operator.name : <Placeholder>operator name not yet published</Placeholder>}
        {operator.location ? `, ${operator.location}` : ''}. Questions and requests about your data
        go to{' '}
        {operator.email ? (
          <a href={`mailto:${operator.email}`}>{operator.email}</a>
        ) : (
          <Placeholder>a contact address has not been published yet</Placeholder>
        )}
        .
      </p>

      <h2>What we store, and why</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name, username, email address, a salted hash of
          your password (never the password itself), and when you agreed to this notice. Needed to
          give you a private account.
        </li>
        <li>
          <strong>Your plan:</strong> the measurements you enter (height, weight, age, optional tape
          measurements), your goal, activity level, and timeframe. Stored only after you give
          separate consent on the plan screen, because they are health-related.
        </li>
        <li>
          <strong>Daily records:</strong> the food, water, exercise, and weight entries you choose
          to log, including any body-fat or muscle values you record.
        </li>
        <li>
          <strong>Sign-in security:</strong> hashed session tokens, hashed confirmation and reset
          tokens, encrypted two-factor secrets, hashed recovery codes, temporary rate-limit
          counters, and security events with pseudonymous account identifiers. Security events are
          retained for 30 days.
        </li>
      </ul>
      <p>
        Nothing is used for advertising or sold. No analytics scripts run on this site. The
        estimates shown (BMI, body fat, lean mass, protein, calories) are calculated from your
        inputs and are general wellness information, not medical advice.
      </p>

      <h2>Who can see it</h2>
      <p>
        Other users cannot access your account records. The operator can access the database to run
        the service, investigate problems, and act on your requests; the operator does not browse
        records otherwise. The email provider used for confirmation and reset messages receives your
        email address and the message text. The hosting and database providers store the data on the
        operator’s behalf.{' '}
        {photosSelfHosted
          ? 'Photographs and fonts are served from this site, so no other company is contacted when you browse.'
          : 'Photographs currently load from Unsplash, which receives ordinary web-request information such as your IP address; fonts are served from this site.'}
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>A sign-up that never confirms its email is deleted after 2 days.</li>
        <li>
          Sessions end after 3 days without activity and after 7 days at most; signing out ends them
          immediately.
        </li>
        <li>
          Confirmation links expire after 24 hours, reset links after 1 hour, and deletion
          confirmations after 5 minutes. Expired tokens and rate counters are removed hourly.
          Encrypted queued email messages expire after one day.
        </li>
        <li>
          Your account, plan, and records are kept until you delete them. Deletion is immediate and
          permanent; backups that contain the data are rotated out on the operator’s backup
          schedule.
        </li>
      </ul>

      <h2>Your choices and rights</h2>
      <p>
        From <Link to="/account">Account & security</Link> you can download everything stored for
        your account as a PDF report (or as a machine-readable JSON file), change your name and
        username, change your password, sign out everywhere, turn on two-factor authentication, and
        delete your account and all its records. You can also change or remove individual entries
        and your plan from the dashboard. Depending on where you live, you may have additional
        rights (for example to correct data or to complain to a supervisory authority); contact the
        operator to exercise them.
      </p>

      <h2>How sign-in works</h2>
      <p>
        Your password is stored as a salted scrypt hash. New passwords are checked against a public
        list of breached passwords using a partial hash, so the password itself never leaves the
        server. A cookie keeps you signed in while you use the app, for at most seven days (three
        days without activity). If you choose Google or Facebook, the provider handles its sign-in
        screen and shares your basic identity information with this application; an existing account
        is never linked automatically.
      </p>

      <h2>About this release</h2>
      <p>
        When run locally, records are stored on the machine running the server. A public deployment
        needs the operator details above, a retention policy, and a location-specific privacy review
        before launch. This notice was last updated in September 2026.
      </p>
      <Link className="button" to="/">
        Back to home
      </Link>
    </div>
  );
}
