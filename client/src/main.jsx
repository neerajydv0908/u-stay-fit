import React, { useEffect, lazy, Suspense } from 'react';
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
const Privacy = lazy(() => import('./pages/Privacy'));
const SpecialNote = lazy(() => import('./pages/SpecialNote'));
import './styles.css';

function ScrollManager() {
  const { pathname, hash, key } = useLocation();
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ autoRaf: true, anchors: true, duration: 1.05 });
    return () => lenis.destroy();
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
      '/fat-loss': 'Understanding fat loss',
      '/muscle-gain': 'Building muscle',
      '/privacy': 'Privacy & your data',
    };
    document.title = `${names[pathname] || 'Page not found'} · U Stay Fit`;
    const timer = setTimeout(() => {
      if (hash)
        document.getElementById(hash.slice(1))?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
        });
      else window.scrollTo({ top: 0, behavior: 'instant' });
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
