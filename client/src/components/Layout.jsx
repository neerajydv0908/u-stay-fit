import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, X, Heart, Camera, Mail } from 'lucide-react';
import { Logo } from './UI';
import { useAuth } from '../context';
import { operator } from '../data';
export function Layout() {
  const [menu, setMenu] = useState(false);
  const { user, profile, error } = useAuth();
  const { pathname } = useLocation();
  const planLink = user ? (profile ? '/dashboard' : '/onboarding') : '/login';
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="nav-wrap">
          <Logo />
          <nav className={menu ? 'nav-links open' : 'nav-links'} aria-label="Main navigation">
            <NavLink to="/" end onClick={() => setMenu(false)}>
              Home
            </NavLink>
            <NavLink to="/muscle-gain" onClick={() => setMenu(false)}>
              Weight <span>(Muscle)</span> Gain
            </NavLink>
            <NavLink to="/fat-loss" onClick={() => setMenu(false)}>
              Weight <span>(Fat)</span> Loss
            </NavLink>
            <Link to="/#contact" onClick={() => setMenu(false)}>
              Contact us
            </Link>
            <NavLink to="/special-note" className="nav-note" onClick={() => setMenu(false)}>
              A special note <Heart size={13} aria-hidden="true" />
            </NavLink>
          </nav>
          <Link to={planLink} className="button nav-cta">
            {user ? 'Go to your plan' : 'Register for the plan'}
            <ArrowUpRight size={16} />
          </Link>
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
            aria-label="Toggle navigation"
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {error && (
        <div className="connection-banner" role="alert">
          {error}
        </div>
      )}
      <main id="main" tabIndex="-1">
        <Outlet />
      </main>
      {!pathname.startsWith('/dashboard') && <Footer />}
    </>
  );
}
export function Footer() {
  return (
    <footer id="contact">
      <div className="container footer-main">
        <div>
          <Logo />
          <p>
            A little knowledge. A little consistency.
            <br />A healthier relationship with you.
          </p>
          <span className="footer-note">
            Made with care, for real life <Heart size={13} />
          </span>
        </div>
        <div>
          <span className="footer-heading">Find your rhythm</span>
          <Link to="/muscle-gain">Build muscle</Link>
          <Link to="/fat-loss">Understand fat loss</Link>
          <Link to="/login">Your personal plan</Link>
        </div>
        <div>
          <span className="footer-heading">Let’s keep in touch</span>
          {operator.email ? (
            <a href={`mailto:${operator.email}`}>
              <Mail size={16} />
              {operator.email}
            </a>
          ) : (
            <span className="contact-placeholder">
              <Mail size={16} />
              Email · coming soon
            </span>
          )}
          {operator.instagram ? (
            <a href={operator.instagram} target="_blank" rel="noreferrer">
              <Camera size={16} />
              Instagram
            </a>
          ) : (
            <span className="contact-placeholder">
              <Camera size={16} />
              Instagram · coming soon
            </span>
          )}
          {operator.x ? (
            <a href={operator.x} target="_blank" rel="noreferrer">
              𝕏 &nbsp; Twitter / X
            </a>
          ) : (
            <span className="contact-placeholder">𝕏 &nbsp; Twitter / X · coming soon</span>
          )}
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} U Stay Fit. Grow at your own pace.</span>
        <span>General adult wellness education. Not medical care.</span>
        <Link to="/privacy">Privacy & your data</Link>
      </div>
    </footer>
  );
}
