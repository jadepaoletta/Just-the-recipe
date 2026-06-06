import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { authApi } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  signInWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([authApi.config(), authApi.me()])
      .then(([config, me]) => {
        setGoogleClientId(config.googleClientId);
        setUser(me?.user ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function signInWithGoogle(credential: string): Promise<void> {
    const { user: u } = await authApi.signInWithGoogle(credential);
    setUser(u);
  }

  async function logout(): Promise<void> {
    await authApi.logout();
    setUser(null);
  }

  if (loading) {
    return (
      <div className="page-loading">
        <span className="loading-spinner loading-spinner-dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  if (!googleClientId) {
    return (
      <div className="auth-config-error">
        <h2>Google sign-in isn't configured.</h2>
        <p>
          Add <code>GOOGLE_CLIENT_ID="..."</code> to <code>secrets.sh</code> and restart the server.
        </p>
      </div>
    );
  }

  const value: AuthState = { user, loading, signInWithGoogle, logout };
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </GoogleOAuthProvider>
  );
}
