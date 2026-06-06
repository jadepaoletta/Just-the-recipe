import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export function Login() {
  const { signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function handleCredential(credential: string) {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle(credential);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">☕</span>
          <span className="login-brand-name">Just the Recipe</span>
        </div>

        <h1 className="login-headline">Your cookbook, without the clutter.</h1>

        <p className="login-subhead">
          Save and edit every recipe you love in one clean, personal library — no pop-ups, no autoplay videos,
          no twelve-paragraph life story before the ingredients. Just the recipe, exactly how you want it.
        </p>

        <ul className="login-bullets">
          <li>
            <span className="login-bullet-icon">📥</span>
            <div>
              <strong>Import from any blog</strong>
              <p>Paste a URL — we strip the ads and keep the recipe.</p>
            </div>
          </li>
          <li>
            <span className="login-bullet-icon">✏️</span>
            <div>
              <strong>Edit anything</strong>
              <p>Tweak ingredients, rewrite steps, add notes for next time.</p>
            </div>
          </li>
          <li>
            <span className="login-bullet-icon">🔒</span>
            <div>
              <strong>Private to you</strong>
              <p>Sign in with Google and your recipes are tied to your account.</p>
            </div>
          </li>
        </ul>

        <div className="login-cta">
          {busy ? (
            <div className="login-busy">
              <span className="loading-spinner loading-spinner-dark" style={{ width: 22, height: 22, borderWidth: 2 }} />
              <span>Signing you in…</span>
            </div>
          ) : (
            <GoogleLogin
              onSuccess={(resp) => resp.credential && handleCredential(resp.credential)}
              onError={() => setError('Google sign-in failed. Please try again.')}
              theme="filled_black"
              size="large"
              text="continue_with"
              shape="pill"
            />
          )}
        </div>

        {error && <div className="login-error">{error}</div>}

        <p className="login-footnote">
          By signing in, you agree to keep your recipes in your own private library. We only read your name,
          email, and profile picture from Google.
        </p>
      </div>
    </div>
  );
}
