/// <reference types="vite/client" />
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Workflow } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import '../Landing/landing.css';

type Mode = 'login' | 'register';

export function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Something went wrong';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/google`;
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
  };

  return (
    <div className="min-h-dvh bg-steel-950 lp-grid-bg flex flex-col">
      {/* Chrome bar — links back to the landing page */}
      <header className="h-12 bg-steel-900/95 border-b border-steel-700">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-pulse rounded"
          >
            <div className="w-6 h-6 rounded bg-volt flex items-center justify-center">
              <Workflow className="w-4 h-4 text-steel-950" />
            </div>
            <span className="text-steel-100 font-semibold text-sm tracking-wide">QuestFlow</span>
          </Link>
          <span className="font-hud text-[11px] text-steel-500 tracking-wider">
            session — {mode === 'login' ? 'sign_in' : 'register'}
          </span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Session panel */}
          <div className="lp-fade bg-steel-850 border border-steel-700 rounded-md shadow-xl overflow-hidden">
            {/* Editor tabs */}
            <div className="flex bg-steel-900 border-b border-steel-700" role="tablist">
              <ModeTab
                active={mode === 'login'}
                label="sign_in"
                onClick={() => switchMode('login')}
              />
              <ModeTab
                active={mode === 'register'}
                label="register"
                onClick={() => switchMode('register')}
              />
            </div>

            <div className="p-8">
              <h1 className="font-display font-semibold uppercase tracking-wide text-lg text-steel-100 mb-1">
                {mode === 'login' ? 'Welcome back' : 'Create account'}
              </h1>
              <p className="text-sm text-steel-400 mb-6">
                {mode === 'login'
                  ? 'Sign in to continue building your quests'
                  : 'Get started with QuestFlow for free'}
              </p>

              {/* Google OAuth */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 bg-steel-800 hover:bg-steel-700 border border-steel-600 text-steel-100 text-sm font-medium rounded-md px-4 py-2.5 transition-colors mb-4 cursor-pointer focus-visible:outline-2 focus-visible:outline-pulse"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-steel-700" />
                <span className="font-hud text-[11px] text-steel-500">or</span>
                <div className="flex-1 h-px bg-steel-700" />
              </div>

              {/* Email / password form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="auth-email"
                    className="block font-hud text-[11px] text-steel-400 tracking-wider mb-1.5"
                  >
                    email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-steel-900 border border-steel-600 focus:border-pulse focus:ring-1 focus:ring-pulse rounded-md px-3 py-2.5 text-sm text-steel-100 placeholder-steel-500 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="auth-password"
                    className="block font-hud text-[11px] text-steel-400 tracking-wider mb-1.5"
                  >
                    password
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-steel-900 border border-steel-600 focus:border-pulse focus:ring-1 focus:ring-pulse rounded-md px-3 py-2.5 text-sm text-steel-100 placeholder-steel-500 outline-none transition-colors"
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-md px-3 py-2"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-volt hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed text-steel-950 font-semibold text-sm rounded-md px-4 py-2.5 transition-[filter] cursor-pointer focus-visible:outline-2 focus-visible:outline-pulse"
                >
                  {loading
                    ? mode === 'login' ? 'Signing in…' : 'Creating account…'
                    : mode === 'login' ? 'Sign in' : 'Create account'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 font-hud text-xs tracking-wider py-2.5 border-b-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-pulse ${
        active
          ? 'border-volt text-steel-100 bg-steel-850'
          : 'border-transparent text-steel-500 hover:text-steel-100'
      }`}
    >
      {label}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
