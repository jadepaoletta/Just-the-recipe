import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { RecipeList } from './pages/RecipeList';
import { RecipeDetail } from './pages/RecipeDetail';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './AuthContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="page-loading">
        <span className="loading-spinner loading-spinner-dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (!user) return null;

  return (
    <div className="user-menu" ref={ref}>
      <button className="user-menu-trigger" onClick={() => setOpen((v) => !v)} aria-label="Account menu">
        {user.picture ? (
          <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" />
        ) : (
          <span className="user-menu-avatar-fallback">{user.name.charAt(0).toUpperCase()}</span>
        )}
      </button>
      {open && (
        <div className="user-menu-pop">
          <div className="user-menu-name">{user.name}</div>
          <div className="user-menu-email">{user.email}</div>
          <button className="user-menu-logout" onClick={() => logout()}>Sign out</button>
        </div>
      )}
    </div>
  );
}

function AppShell() {
  const { user } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="topbar-logo">
          <span className="topbar-logo-icon">🥐🍜🧋✨</span>
          Just the Recipe
        </Link>
        {user && <UserMenu />}
      </header>
      <main className="main">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><RecipeList /></ProtectedRoute>} />
          <Route path="/recipes/:id" element={<ProtectedRoute><RecipeDetail /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
