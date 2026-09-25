import React, { useEffect, useRef, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import Lenis from 'lenis';
import { AuthProvider, useAuth } from './context';
import { Layout } from './components/Layout';
import { Loading } from './components/UI';
import Home from './pages/Home';
const Auth = lazy(() => import('./pages/Auth'));
const Article = lazy(() => import('./pages/Articles'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Account = lazy(() => import('./pages/Account'));
const Recovery = lazy(() => import('./pages/Recovery'));
const DeleteAccount = lazy(() => import('./pages/DeleteAccount'));
const Privacy = lazy(() => import('./pages/Privacy'));
const SpecialNote = lazy(() => import('./pages/SpecialNote'));
import './styles.css';

// Scrolls to a section such as #contact after a link is followed. Lenis (the smooth scroller)
// caches the page height and only refreshes it about 250 ms after the page grows. Coming from a
// shorter page, it still used the old height, so the first "Contact us" click stopped halfway and
// only a second click reached the footer. Refresh Lenis first, scroll with Lenis itself, and check
// once more when the scroll ends, because images that finish loading can still move the target.
const hashId = (hash) => {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1); // a malformed link such as "/#%" must not break the page
  }
};
function scrollToSection(id, lenis, { tries = 0, corrected = false } = {}) {
  const target = document.getElementById(id);
  // A lazily loaded page may not have rendered its sections yet: look again shortly.
  if (!target) {
    if (tries < 30)
      setTimeout(() => {
        // Only if the person is still on that link (they may have moved on).
        if (hashId(window.location.hash) === id) scrollToSection(id, lenis, { tries: tries + 1 });
      }, 100);
    return;
  }
  if (!lenis) return target.scrollIntoView({ behavior: 'instant' }); // reduced motion
  lenis.resize();
  lenis.scrollTo(target, {
    onComplete: () => {
      if (corrected || !target.isConnected || hashId(window.location.hash) !== id) return;
      const page = document.documentElement;
      const atBottom = Math.ceil(window.scrollY + window.innerHeight) >= page.scrollHeight - 2;
      const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      const missedBy = Math.abs(target.getBoundingClientRect().top - margin);
      if (missedBy > 2 && !atBottom) scrollToSection(id, lenis, { corrected: true });
    },
  });
}
function ScrollManager() {
  const { pathname, hash, key } = useLocation();
  const lenisRef = useRef(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ autoRaf: true, anchors: true, duration: 1.05 });
    lenisRef.current = lenis;
    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);
  useEffect(() => {
    const names = {
      '/': 'A little better, every day',
      '/login': 'Welcome back',
      '/signup': 'Create your account',
      '/onboarding': 'Your personal plan',
      '/dashboard': 'Your dashboard',
      '/account': 'Account & security',
      '/verify': 'Confirming your email',
      '/forgot-password': 'Reset your password',
      '/reset-password': 'Choose a new password',
      '/delete-account': 'Delete your account',
      '/fat-loss': 'Understanding fat loss',
      '/muscle-gain': 'Building muscle',
      '/privacy': 'Privacy & your data',
    };
    document.title = `${names[pathname] || 'Page not found'} · U Stay Fit`;
    const timer = setTimeout(() => {
      if (hash) scrollToSection(hashId(hash), lenisRef.current);
      else {
        // Stop any smooth scroll still running from the previous page before starting at the top.
        lenisRef.current?.scrollTo(0, { immediate: true, force: true });
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    }, 70);
    return () => clearTimeout(timer);
  }, [pathname, hash, key]);
  return null;
}
function Protected({ children, requireProfile = false }) {
  const { user, profile, loading, error } = useAuth();
  if (loading) return <Loading />;
  if (error)
    return (
      <div className="container simple-page">
        <h1>We couldn’t connect.</h1>
        <p>{error}</p>
        <button className="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (requireProfile && !profile) return <Navigate to="/onboarding" replace />;
  return children;
}
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ScrollManager />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="muscle-gain" element={<Article type="gain" />} />
              <Route path="fat-loss" element={<Article type="loss" />} />
              <Route path="login" element={<Auth />} />
              <Route path="signup" element={<Auth signup />} />
              <Route path="verify" element={<Recovery mode="verify" />} />
              <Route path="forgot-password" element={<Recovery mode="forgot" />} />
              <Route path="reset-password" element={<Recovery mode="reset" />} />
              <Route path="delete-account" element={<DeleteAccount />} />
              <Route
                path="account"
                element={
                  <Protected>
                    <Account />
                  </Protected>
                }
              />
              <Route
                path="onboarding"
                element={
                  <Protected>
                    <Onboarding />
                  </Protected>
                }
              />
              <Route
                path="dashboard"
                element={
                  <Protected requireProfile>
                    <Dashboard />
                  </Protected>
                }
              />
              <Route path="privacy" element={<Privacy />} />
              <Route path="special-note" element={<SpecialNote />} />
              <Route
                path="*"
                element={
                  <div className="container simple-page">
                    <h1>A little off the path.</h1>
                    <p>This page doesn’t exist. Let’s get you back.</p>
                    <Link className="button" to="/">
                      Back to home
                    </Link>
                  </div>
                }
              />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
