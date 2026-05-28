import { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase-config';
import { useAuth } from '../context/AuthContext';

// ============================================
// COMPONENTĂ PRINCIPALĂ
// Comută între viziunea de profesor și cea de student
// ============================================

export default function Dashboard() {
  const { user, role, logout } = useAuth();

  return (
    <div style={styles.container} data-testid="dashboard">
      <header style={styles.header}>
        <h1 style={styles.title}>ExamFlow</h1>
        <div style={styles.userInfo}>
          <span data-testid="user-email">{user.email}</span>
          <span style={styles.roleBadge} data-testid="user-role">{role}</span>
          <button
            onClick={logout}
            style={styles.btnSecondary}
            data-testid="logout-button"
          >
            Logout
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {role === 'professor' && <ProfesorView />}
        {role === 'student' && <StudentView />}
        {!role && (
          <p style={styles.warning} data-testid="no-role-warning">
            Contul tău nu are un rol atribuit. Contactează administratorul.
          </p>
        )}
      </main>
    </div>
  );
}

// ============================================
// VIZIUNEA PROFESORULUI
// Formular pentru creare slot + listă proprie
// ============================================

function ProfesorView() {
  const { user } = useAuth();
  const [numeSala, setNumeSala] = useState('');
  const [capacitate, setCapacitate] = useState('');
  const [dataExamen, setDataExamen] = useState('');
  const [materie, setMaterie] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [sloturi, setSloturi] = useState([]);

  // Listener real-time pentru sloturile proprii
  useEffect(() => {
    const q = query(
      collection(db, 'sesiuni_sloturi'),
      where('profesorId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setSloturi(docs);
    });

    return () => unsubscribe();
  }, [user.uid]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const capacitateNum = parseInt(capacitate, 10);
      if (isNaN(capacitateNum) || capacitateNum <= 0) {
        throw new Error('Capacitatea trebuie să fie un număr pozitiv.');
      }

      const dataExamenDate = new Date(dataExamen);
      if (isNaN(dataExamenDate.getTime())) {
        throw new Error('Data examenului este invalidă.');
      }

      // Date denormalizate stocate direct în document
      // (Capitolul 3.3.1 din lucrare)
      await addDoc(collection(db, 'sesiuni_sloturi'), {
        profesorId: user.uid,
        profesorEmail: user.email,
        numeSala: numeSala.trim(),
        capacitateTotala: capacitateNum,
        locuriOcupate: 0,
        materie: materie.trim(),
        dataExamen: Timestamp.fromDate(dataExamenDate),
        status: 'open',
        isLocked: false,
        dataCreare: serverTimestamp(),
      });

      setFeedback({ type: 'success', message: 'Slot creat cu succes!' });
      setNumeSala('');
      setCapacitate('');
      setDataExamen('');
      setMaterie('');
    } catch (error) {
      console.error('[ProfesorView] Eroare la creare slot', error);
      setFeedback({ type: 'error', message: error.message || 'Eroare necunoscută.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-testid="profesor-view">
      <section style={styles.card}>
        <h2>Creează un slot de examen</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Materie
            <input
              type="text"
              value={materie}
              onChange={(e) => setMaterie(e.target.value)}
              required
              style={styles.input}
              data-testid="input-materie"
              aria-label="Materie"
            />
          </label>

          <label style={styles.label}>
            Nume sală
            <input
              type="text"
              value={numeSala}
              onChange={(e) => setNumeSala(e.target.value)}
              required
              style={styles.input}
              data-testid="input-nume-sala"
              aria-label="Nume sală"
            />
          </label>

          <label style={styles.label}>
            Capacitate
            <input
              type="number"
              min="1"
              value={capacitate}
              onChange={(e) => setCapacitate(e.target.value)}
              required
              style={styles.input}
              data-testid="input-capacitate"
              aria-label="Capacitate"
            />
          </label>

          <label style={styles.label}>
            Data și ora examenului
            <input
              type="datetime-local"
              value={dataExamen}
              onChange={(e) => setDataExamen(e.target.value)}
              required
              style={styles.input}
              data-testid="input-data-examen"
              aria-label="Data examenului"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            style={styles.btnPrimary}
            data-testid="btn-creare-slot"
          >
            {submitting ? 'Se creează...' : 'Creează slot'}
          </button>
        </form>

        {feedback && (
          <p
            style={feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess}
            data-testid={`feedback-${feedback.type}`}
            role={feedback.type === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        )}
      </section>

      <section style={styles.card}>
        <h2>Sloturile tale ({sloturi.length})</h2>
        {sloturi.length === 0 ? (
          <p data-testid="empty-sloturi-profesor">Nu ai creat încă niciun slot.</p>
        ) : (
          <ul style={styles.lista} data-testid="lista-sloturi-profesor">
            {sloturi.map((slot) => (
              <li key={slot.id} style={styles.slotItem} data-testid={`slot-row-${slot.id}`}>
                <strong>{slot.materie}</strong> — {slot.numeSala}
                <br />
                <small>
                  {slot.dataExamen?.toDate().toLocaleString('ro-RO')} |
                  Locuri: {slot.locuriOcupate}/{slot.capacitateTotala} |
                  Status: <span data-testid={`slot-status-${slot.id}`}>{slot.status}</span>
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ============================================
// VIZIUNEA STUDENTULUI
// Listă sloturi deschise + acțiune de înscriere
// ============================================

function StudentView() {
  const [sloturi, setSloturi] = useState([]);
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [feedback, setFeedback] = useState(null);

  // Listener pentru sloturile deschise
  useEffect(() => {
    const q = query(
      collection(db, 'sesiuni_sloturi'),
      where('status', '==', 'open')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setSloturi(docs);
    });

    return () => unsubscribe();
  }, []);

  const handleInscriere = async (slotId) => {
    setLoadingIds((prev) => new Set(prev).add(slotId));
    setFeedback(null);

    try {
      const inscrieStudent = httpsCallable(functions, 'inscrieStudentLaSlot');
      const result = await inscrieStudent({ slotId });

      setFeedback({
        type: 'success',
        message: `Înscriere reușită! Locuri rămase: ${result.data.locuriRamase}`,
      });
    } catch (error) {
      console.error('[StudentView] Eroare la înscriere', error);
      setFeedback({
        type: 'error',
        message: error.message || 'Înscrierea a eșuat. Încearcă din nou.',
      });
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(slotId);
        return next;
      });
    }
  };

  return (
    <div data-testid="student-view">
      <section style={styles.card}>
        <h2>Examene disponibile ({sloturi.length})</h2>

        {feedback && (
          <p
            style={feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess}
            data-testid={`feedback-${feedback.type}`}
            role={feedback.type === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        )}

        {sloturi.length === 0 ? (
          <p data-testid="empty-sloturi-student">
            Nu există examene disponibile pentru înscriere în acest moment.
          </p>
        ) : (
          <ul style={styles.lista} data-testid="lista-sloturi-student">
            {sloturi.map((slot) => {
              const locuriLibere = slot.capacitateTotala - slot.locuriOcupate;
              const slotPlin = locuriLibere <= 0;
              const isLoading = loadingIds.has(slot.id);

              return (
                <li
                  key={slot.id}
                  style={styles.slotItem}
                  data-testid={`slot-card-${slot.id}`}
                >
                  <div>
                    <strong data-testid={`slot-materie-${slot.id}`}>{slot.materie}</strong>
                    <span style={styles.separator}>—</span>
                    <span data-testid={`slot-sala-${slot.id}`}>{slot.numeSala}</span>
                  </div>
                  <div style={styles.slotMeta}>
                    <small>
                      Data: {slot.dataExamen?.toDate().toLocaleString('ro-RO')}
                    </small>
                    <small>
                      Profesor: {slot.profesorEmail}
                    </small>
                    <small data-testid={`slot-locuri-${slot.id}`}>
                      Locuri libere: {locuriLibere}/{slot.capacitateTotala}
                    </small>
                  </div>
                  <button
                    onClick={() => handleInscriere(slot.id)}
                    disabled={slotPlin || isLoading}
                    style={slotPlin ? styles.btnDisabled : styles.btnPrimary}
                    data-testid={`btn-inscriere-${slot.id}`}
                    aria-label={`Înscrie-te la examenul de ${slot.materie}`}
                  >
                    {isLoading ? 'Se procesează...' : slotPlin ? 'Slot plin' : 'Înscrie-te'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ============================================
// STILURI INLINE
// ============================================

const styles = {
  container: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    minHeight: '100vh',
    backgroundColor: '#f5f5f7',
    color: '#1d1d1f',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e5ea',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 600,
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  roleBadge: {
    padding: '0.25rem 0.75rem',
    backgroundColor: '#007aff',
    color: 'white',
    borderRadius: '999px',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  main: {
    padding: '2rem',
    maxWidth: '900px',
    margin: '0 auto',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    marginTop: '1rem',
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
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d1d6',
    borderRadius: '8px',
    fontSize: '1rem',
    fontFamily: 'inherit',
  },
  btnPrimary: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#007aff',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnSecondary: {
    padding: '0.5rem 1rem',
    backgroundColor: '#e5e5ea',
    color: '#1d1d1f',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  btnDisabled: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#d1d1d6',
    color: '#8e8e93',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'not-allowed',
  },
  lista: {
    listStyle: 'none',
    padding: 0,
    margin: '1rem 0 0',
  },
  slotItem: {
    padding: '1rem',
    borderBottom: '1px solid #e5e5ea',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  slotMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    color: '#6e6e73',
  },
  separator: {
    margin: '0 0.5rem',
    color: '#8e8e93',
  },
  feedbackSuccess: {
    marginTop: '1rem',
    padding: '0.75rem',
    backgroundColor: '#e8f5e9',
    color: '#1b5e20',
    borderRadius: '8px',
  },
  feedbackError: {
    marginTop: '1rem',
    padding: '0.75rem',
    backgroundColor: '#ffebee',
    color: '#b71c1c',
    borderRadius: '8px',
  },
  warning: {
    padding: '1rem',
    backgroundColor: '#fff3e0',
    color: '#e65100',
    borderRadius: '8px',
  },
};