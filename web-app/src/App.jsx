import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Dashboard from './components/Dashboard';

// ============================================
// COMPONENTĂ ROOT
// Wrap-uiește totul în AuthProvider
// ============================================

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

// ============================================
// CONȚINUTUL APLICAȚIEI
// Routing minimal bazat pe starea de autentificare
// ============================================

function AppContent() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={loadingStyles.container} data-testid="loading-screen">
        <p>Se încarcă...</p>
      </div>
    );
  }

  return isAuthenticated ? <Dashboard /> : <Login />;
}

// ============================================
// COMPONENTĂ LOGIN
// Email + parolă, integrată cu Firebase Auth prin context
// ============================================

function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login(email, password);
      // AuthContext va redirecționa automat după onAuthStateChanged
    } catch (err) {
      console.error('[Login] Eroare la autentificare', err);
      setError(translateAuthError(err.code) || err.message);
      setSubmitting(false);
    }
  };

  return (
    <div style={loginStyles.container} data-testid="login-screen">
      <div style={loginStyles.card}>
        <h1 style={loginStyles.title}>ExamFlow</h1>
        <p style={loginStyles.subtitle}>Autentificare</p>

        <form onSubmit={handleSubmit} style={loginStyles.form}>
          <label style={loginStyles.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              style={loginStyles.input}
              data-testid="login-email"
              aria-label="Email"
            />
          </label>

          <label style={loginStyles.label}>
            Parolă
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={loginStyles.input}
              data-testid="login-password"
              aria-label="Parolă"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            style={loginStyles.btn}
            data-testid="login-submit"
          >
            {submitting ? 'Se autentifică...' : 'Autentificare'}
          </button>
        </form>

        {error && (
          <p style={loginStyles.error} data-testid="login-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// Traducere mesaje de eroare Firebase Auth
function translateAuthError(code) {
  const map = {
    'auth/invalid-email': 'Email invalid.',
    'auth/user-not-found': 'Utilizatorul nu există.',
    'auth/wrong-password': 'Parolă incorectă.',
    'auth/invalid-credential': 'Credențiale invalide.',
    'auth/too-many-requests': 'Prea multe încercări. Așteaptă puțin.',
    'auth/network-request-failed': 'Eroare de rețea. Verifică conexiunea.',
  };
  return map[code] || null;
}

// ============================================
// STILURI
// ============================================

const loadingStyles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#f5f5f7',
  },
};

const loginStyles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#f5f5f7',
    padding: '1rem',
  },
  card: {
    width: '100%',
    maxWidth: '380px',
    padding: '2rem',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  title: {
    margin: 0,
    fontSize: '1.75rem',
    fontWeight: 600,
    textAlign: 'center',
  },
  subtitle: {
    margin: '0.5rem 0 1.5rem',
    color: '#6e6e73',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    fontWeight: 500,
    fontSize: '0.875rem',
    color: '#3c3c43',
  },
  input: {
    marginTop: '0.25rem',
    padding: '0.625rem 0.75rem',
    border: '1px solid #d1d1d6',
    borderRadius: '8px',
    fontSize: '1rem',
    fontFamily: 'inherit',
  },
  btn: {
    marginTop: '0.5rem',
    padding: '0.75rem',
    backgroundColor: '#007aff',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  error: {
    marginTop: '1rem',
    padding: '0.75rem',
    backgroundColor: '#ffebee',
    color: '#b71c1c',
    borderRadius: '8px',
    fontSize: '0.875rem',
    textAlign: 'center',
  },
};