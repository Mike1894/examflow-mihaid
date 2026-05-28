import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '../firebase-config';

// ============================================
// CONTEXT REACT pentru starea de autentificare
// ============================================

const AuthContext = createContext(null);

// Hook custom pentru consumul contextului
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth trebuie folosit în interiorul unui <AuthProvider>');
  }
  return context;
}

// ============================================
// PROVIDER
// ============================================

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Ascultător pentru schimbările de autentificare
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Forțăm refresh-ul token-ului pentru a citi cele mai recente custom claims
          // (relevant după setCustomUserRole în setup-ul de test)
          const tokenResult = await firebaseUser.getIdTokenResult(true);
          const userRole = tokenResult.claims.role || null;

          setUser(firebaseUser);
          setRole(userRole);

          console.info('[Auth] Utilizator autentificat', {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            role: userRole,
          });
        } catch (error) {
          console.error('[Auth] Eroare la citirea token-ului', error);
          setUser(firebaseUser);
          setRole(null);
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ============================================
  // ACȚIUNI EXPUSE
  // ============================================

  const login = async (email, password) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value = {
    user,
    role,
    loading,
    isAuthenticated: user !== null,
    isProfessor: role === 'professor',
    isStudent: role === 'student',
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}