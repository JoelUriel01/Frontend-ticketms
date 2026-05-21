'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/supabase/api';
import type { Variants } from 'framer-motion';


/* ─── Types ─────────────────────────────────────────────── */
interface Event {
  id: string;
  title: string;
  description: string;
  venueName: string;
  venueCity: string;
  startsAt: string;
  endsAt: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  bannerUrl?: string;                                              // URL de imagen del banner
  category?: 'music' | 'theater' | 'sport' | 'festival' | 'other'; // Categoría del evento
}

interface Profile {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

/* ─── Animation Variants ─────────────────────────────────── */
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};

const cardVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 24,
  },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      damping: 26,
      stiffness: 220,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: 0.18,
      ease: [0.4, 0, 1, 1],
    },
  },
};

const headerVariants: Variants = {
  hidden: { opacity: 0, y: -16 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      damping: 28,
      stiffness: 200,
      delay: 0.05,
    },
  },
};

const formVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 16,
    scale: 0.98,
  },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      damping: 28,
      stiffness: 200,
    },
  },
  exit: {
    opacity: 0,
    y: -12,
    scale: 0.97,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 1, 1],
    },
  },
};

/* ─── Helpers ────────────────────────────────────────────── */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ─── Sub-components ─────────────────────────────────────── */
function StatusBadge({ published }: { published: boolean }) {
  return (
    <motion.span
      layout
      className={`status-badge ${published ? 'published' : 'draft'}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
    >
      <span className="status-dot" />
      {published ? 'Publicado' : 'Borrador'}
    </motion.span>
  );
}

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skel-title" />
      <div className="skeleton skel-meta" />
      <div className="skeleton skel-body" />
      <div className="skeleton skel-body short" />
      <div className="skel-footer">
        <div className="skeleton skel-badge" />
        <div className="skeleton skel-btn" />
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 24, stiffness: 180 }}
    >
      <svg className="empty-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="6" y="10" width="36" height="32" rx="4" stroke="currentColor" strokeWidth="2" />
        <path d="M16 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" stroke="currentColor" strokeWidth="2" />
        <line x1="16" y1="22" x2="32" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="30" x2="26" y2="30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <h3>Todavía no hay eventos</h3>
      <p>Crea tu primer evento y aparecerá aquí listo para publicar.</p>
      <button className="btn btn-primary" onClick={onCreateClick}>Crear evento</button>
    </motion.div>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */
export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const router = useRouter();

  const [form, setForm] = useState({
    title: '', description: '', venueName: '', venueCity: '', startsAt: '', endsAt: '',
    bannerUrl: '', category: 'other' as Event['category'],
  });

  const supabase = createClient();
  const isOrganizer = profile?.role === 'ORGANIZER';

  async function loadData() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [profileRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/users/me`, { headers }),
        fetch(`${API_BASE_URL}/events/me`, { headers }),
      ]);
      if (profileRes.ok) setProfile(await profileRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setActionLoading('create');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          ...form,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Error al crear evento'); }
      setForm({ title: '', description: '', venueName: '', venueCity: '', startsAt: '', endsAt: '', bannerUrl: '', category: 'other' });
      setShowForm(false);
      setSuccessMsg('Evento creado correctamente.');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  }

  async function togglePublish(event: Event) {
    setActionLoading(event.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const action = event.isPublished ? 'unpublish' : 'publish';
      const res = await fetch(`${API_BASE_URL}/events/${event.id}/${action}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error('Error al cambiar estado');
      const updated = await res.json();
      setEvents(prev => prev.map(ev => ev.id === event.id ? { ...ev, isPublished: updated.isPublished } : ev));
      setSuccessMsg(updated.isPublished ? 'Evento publicado.' : 'Evento despublicado.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  }

  const totalEvents = events.length;
  const publishedCount = events.filter(e => e.isPublished).length;
  const draftCount = events.filter(e => !e.isPublished).length;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="page-root">

        {/* Header */}
        <motion.header className="page-header" variants={headerVariants} initial="hidden" animate="show">
          <div className="header-inner">
            <div className="header-left">
              <svg className="logo-mark" viewBox="0 0 32 32" fill="none" aria-label="Ticket logo">
                <rect x="2" y="8" width="28" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="9" cy="16" r="3" stroke="currentColor" strokeWidth="1.5" />
                <line x1="14" y1="12" x2="26" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14" y1="20" x2="24" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <div>
                <h1 className="page-title">Mis Eventos</h1>
                {profile && <p className="page-subtitle">{profile.fullName} · {profile.role}</p>}
              </div>
            </div>
            {isOrganizer && (
              <motion.button
                className="btn btn-primary"
                onClick={() => setShowForm(v => !v)}
                whileHover={{ y: -1 }} whileTap={{ y: 0, scale: 0.97 }}
                transition={{ type: 'spring', damping: 20, stiffness: 400 }}
              >
                {showForm ? 'Cancelar' : '+ Nuevo evento'}
              </motion.button>
            )}
          </div>
        </motion.header>

        <main className="page-main">

          {/* Alertas */}
          <AnimatePresence>
            {error && (
              <motion.div className="alert alert-error"
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ type: 'spring', damping: 24, stiffness: 260 }}
              >
                {error}
                <button className="alert-close" onClick={() => setError('')}>✕</button>
              </motion.div>
            )}
            {successMsg && (
              <motion.div className="alert alert-success"
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ type: 'spring', damping: 24, stiffness: 260 }}
              >
                {successMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stats */}
          {!loading && events.length > 0 && (
            <motion.div className="stats-row"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, type: 'spring', damping: 24, stiffness: 180 }}
            >
              <div className="stat-chip"><span className="stat-value">{totalEvents}</span><span className="stat-label">Total</span></div>
              <div className="stat-chip accent-green"><span className="stat-value">{publishedCount}</span><span className="stat-label">Publicados</span></div>
              <div className="stat-chip accent-amber"><span className="stat-value">{draftCount}</span><span className="stat-label">Borradores</span></div>
            </motion.div>
          )}

          {/* Formulario */}
          <AnimatePresence>
            {showForm && (
              <motion.section className="form-panel" variants={formVariants} initial="hidden" animate="show" exit="exit">
                <h2 className="form-title">Nuevo evento</h2>
                <form className="create-form" onSubmit={handleCreate}>
                  <div className="form-row">
                    <div className="field full">
                      <label htmlFor="title">Título</label>
                      <input id="title" type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="Nombre del evento" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="field full">
                      <label htmlFor="description">Descripción</label>
                      <textarea id="description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Describe el evento" />
                    </div>
                  </div>
                  <div className="form-row two-col">
                    <div className="field">
                      <label htmlFor="venueName">Recinto</label>
                      <input id="venueName" type="text" value={form.venueName} onChange={e => setForm({ ...form, venueName: e.target.value })} required placeholder="Auditorio Nacional" />
                    </div>
                    <div className="field">
                      <label htmlFor="venueCity">Ciudad</label>
                      <input id="venueCity" type="text" value={form.venueCity} onChange={e => setForm({ ...form, venueCity: e.target.value })} required placeholder="Ciudad de México" />
                    </div>
                  </div>
                  <div className="form-row two-col">
                    <div className="field">
                      <label htmlFor="startsAt">Inicio</label>
                      <input id="startsAt" type="datetime-local" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} required />
                    </div>
                    <div className="field">
                      <label htmlFor="endsAt">Fin</label>
                      <input id="endsAt" type="datetime-local" value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} required />
                    </div>
                  </div>
                  <div className="form-row two-col">
                    <div className="field">
                      <label htmlFor="category">Categoría</label>
                      <select
                        id="category"
                        value={form.category}
                        onChange={e => setForm({ ...form, category: e.target.value as Event['category'] })}
                      >
                        <option value="music">🎵 Música</option>
                        <option value="theater">🎭 Teatro</option>
                        <option value="sport">🏟️ Deporte</option>
                        <option value="festival">🎪 Festival</option>
                        <option value="other">📌 Otro</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="bannerUrl">URL del banner <span className="field-optional">(opcional)</span></label>
                      <input
                        id="bannerUrl"
                        type="url"
                        value={form.bannerUrl}
                        onChange={e => setForm({ ...form, bannerUrl: e.target.value })}
                        placeholder="https://ejemplo.com/banner.jpg"
                      />
                    </div>
                  </div>
                  {form.bannerUrl && (
                    <div className="banner-preview">
                      <img
                        src={form.bannerUrl}
                        alt="Vista previa del banner"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <div className="form-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={actionLoading === 'create'}>
                      {actionLoading === 'create' ? 'Creando…' : 'Crear evento'}
                    </button>
                  </div>
                </form>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Lista */}
          {loading ? (
            <div className="events-grid">
              {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : !isOrganizer ? (
            <motion.div className="access-denied" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p>Tu cuenta tiene el rol <strong>{profile?.role ?? 'desconocido'}</strong> y no puede gestionar eventos.</p>
            </motion.div>
          ) : events.length === 0 ? (
            <EmptyState onCreateClick={() => setShowForm(true)} />
          ) : (
            <motion.div className="events-grid" variants={containerVariants} initial="hidden" animate="show">
              <AnimatePresence>
                {events.map(event => (
                  <motion.article
                    key={event.id}
                    className={`event-card ${event.isPublished ? 'is-published' : 'is-draft'}`}
                    variants={cardVariants}
                    layout
                    whileHover={{ y: -3, boxShadow: '0 8px 32px oklch(0 0 0 / 0.22)', transition: { duration: 0.18 } }}
                  >
                    {/* Cabecera de la card */}
                    <div className="card-head">
                      <div className="card-head-top">
                        <StatusBadge published={event.isPublished} />
                        <span className="card-id">#{event.id.slice(0, 6).toUpperCase()}</span>
                      </div>
                      <h2 className="card-title">{event.title}</h2>
                      {event.description && (
                        <p className="card-description">{event.description}</p>
                      )}
                    </div>

                    {/* Meta del evento */}
                    <div className="card-meta">
                      <div className="meta-item">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                        </svg>
                        <span>{event.venueName}, {event.venueCity}</span>
                      </div>
                      <div className="meta-item">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <span>{fmtDate(event.startsAt)}</span>
                      </div>
                      <div className="meta-item">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span>Fin: {fmtDate(event.endsAt)}</span>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="card-footer">
                      <motion.button
                        className={`btn ${event.isPublished ? 'btn-outline-danger' : 'btn-publish'}`}
                        onClick={() => togglePublish(event)}
                        disabled={actionLoading === event.id}
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                      >
                        {actionLoading === event.id ? 'Procesando…' : event.isPublished ? 'Despublicar' : 'Publicar'}
                      </motion.button>
                      <motion.button
                        className="btn btn-secondary"
                        onClick={() => router.push(`/events/${event.id}/ticket-types`)}
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                      >
                        Gestionar boletos
                      </motion.button>
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </main>
      </div>
    </>
  );
}

const CSS = `
  @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');

  :root {
    --bg: #0a0a0c;
    --surface: #111114;
    --surface-2: #18181c;
    --surface-3: #202026;
    --border: rgba(255,255,255,0.07);
    --border-hover: rgba(255,255,255,0.13);
    --text: #f0f0f2;
    --text-muted: #8a8a92;
    --text-faint: #4a4a54;
    --green: #22c55e;
    --green-dim: rgba(34,197,94,0.12);
    --green-border: rgba(34,197,94,0.25);
    --amber: #f59e0b;
    --amber-dim: rgba(245,158,11,0.12);
    --amber-border: rgba(245,158,11,0.25);
    --red: #ef4444;
    --red-dim: rgba(239,68,68,0.12);
    --red-border: rgba(239,68,68,0.28);
    --accent: #6366f1;
    --accent-dim: rgba(99,102,241,0.15);
    --radius: 14px;
    --radius-lg: 18px;
    --tr: 180ms cubic-bezier(0.16,1,0.3,1);
    --font: 'Satoshi', system-ui, sans-serif;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .page-root {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 15px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Header ── */
  .page-header {
    border-bottom: 1px solid var(--border);
    padding: 0.9rem clamp(1rem, 4vw, 2.5rem);
    position: sticky;
    top: 0;
    background: rgba(10,10,12,0.88);
    backdrop-filter: blur(16px);
    z-index: 20;
  }
  .header-inner {
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .logo-mark {
    width: 32px;
    height: 32px;
    color: var(--accent);
    flex-shrink: 0;
  }
  .page-title {
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
  }
  .page-subtitle {
    font-size: 0.78rem;
    color: var(--text-muted);
    margin-top: 1px;
  }

  /* ── Main ── */
  .page-main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 2rem clamp(1rem, 4vw, 2rem) 5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ── Alerts ── */
  .alert {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    font-size: 0.875rem;
    font-weight: 500;
  }
  .alert-error { background: var(--red-dim); border: 1px solid var(--red-border); color: #fca5a5; }
  .alert-success { background: var(--green-dim); border: 1px solid var(--green-border); color: #86efac; }
  .alert-close { background: none; border: none; color: inherit; cursor: pointer; font-size: 1rem; opacity: 0.7; padding: 0; }
  .alert-close:hover { opacity: 1; }

  /* ── Stats ── */
  .stats-row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .stat-chip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.85rem;
    border-radius: 9999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    font-size: 0.82rem;
  }
  .stat-chip.accent-green { background: var(--green-dim); border-color: var(--green-border); }
  .stat-chip.accent-amber { background: var(--amber-dim); border-color: var(--amber-border); }
  .stat-value { font-weight: 700; color: var(--text); }
  .stat-label { color: var(--text-muted); }

  /* ── Form panel ── */
  .form-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
  }
  .form-title {
    font-size: 1rem;
    font-weight: 700;
    margin-bottom: 1.25rem;
    color: var(--text);
  }
  .create-form { display: flex; flex-direction: column; gap: 1rem; }
  .form-row { display: flex; gap: 1rem; }
  .form-row.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; }
  .field.full { width: 100%; }
  .field label { font-size: 0.78rem; font-weight: 600; color: var(--text-muted); letter-spacing: 0.03em; }
  .field select {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--font);
    font-size: 0.9rem;
    padding: 0.55rem 0.75rem;
    transition: border-color var(--tr), box-shadow var(--tr);
    width: 100%;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8a92' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    cursor: pointer;
  }
  .field select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
  }
  .field select option { background: #18181c; }
  .field-optional {
    font-weight: 400;
    color: var(--text-faint);
    font-size: 0.72rem;
    letter-spacing: 0;
    text-transform: none;
  }
  .banner-preview {
    width: 100%;
    height: 120px;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
    background: var(--surface-2);
  }
  .banner-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .field input, .field textarea {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--font);
    font-size: 0.9rem;
    padding: 0.55rem 0.75rem;
    transition: border-color var(--tr), box-shadow var(--tr);
    width: 100%;
    resize: vertical;
  }
  .field input:focus, .field textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding-top: 0.25rem;
  }

  /* ── Grid de eventos ── */
  .events-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.25rem;
  }

  /* ── Event Card ── */
  .event-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
    transition: border-color var(--tr);
    cursor: default;
  }
  .event-card.is-published { border-color: rgba(99,102,241,0.2); }
  .event-card.is-draft { border-color: var(--border); }
  .event-card:hover { border-color: var(--border-hover); }

  .card-head {
    padding: 1.1rem 1.25rem 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .card-head-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .card-id {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-faint);
    letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums;
  }
  .card-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.01em;
    line-height: 1.3;
  }
  .card-description {
    font-size: 0.82rem;
    color: var(--text-muted);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-meta {
    padding: 0.85rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    border-bottom: 1px solid var(--border);
    flex: 1;
  }
  .meta-item {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .meta-item svg { color: var(--text-faint); flex-shrink: 0; }

  .card-footer {
    padding: 0.9rem 1.25rem;
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  /* ── Status badge ── */
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
  }
  .status-badge.published { background: var(--green-dim); color: var(--green); border: 1px solid var(--green-border); }
  .status-badge.draft { background: var(--amber-dim); color: var(--amber); border: 1px solid var(--amber-border); }
  .status-dot { width: 5px; height: 5px; border-radius: 9999px; background: currentColor; }

  /* ── Buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    border-radius: var(--radius);
    font-family: var(--font);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: opacity var(--tr), transform var(--tr), background var(--tr);
    white-space: nowrap;
  }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover:not(:disabled) { opacity: 0.88; }
  .btn-secondary { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
  .btn-secondary:hover:not(:disabled) { background: var(--surface-3); }
  .btn-ghost { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
  .btn-ghost:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
  .btn-publish { background: var(--green-dim); color: var(--green); border: 1px solid var(--green-border); }
  .btn-publish:hover:not(:disabled) { background: rgba(34,197,94,0.2); }
  .btn-outline-danger { background: var(--red-dim); color: var(--red); border: 1px solid var(--red-border); }
  .btn-outline-danger:hover:not(:disabled) { background: rgba(239,68,68,0.2); }

  /* ── Skeleton ── */
  @keyframes shimmer { to { background-position: -200% center; } }
  .skeleton {
    border-radius: 6px;
    background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 50%, var(--surface-2) 75%);
    background-size: 200% auto;
    animation: shimmer 1.4s linear infinite;
  }
  .skeleton-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .skel-title { height: 20px; width: 65%; }
  .skel-meta { height: 14px; width: 45%; }
  .skel-body { height: 13px; width: 100%; }
  .skel-body.short { width: 75%; }
  .skel-footer { display: flex; gap: 0.6rem; margin-top: 0.25rem; }
  .skel-badge { height: 22px; width: 80px; border-radius: 9999px; }
  .skel-btn { height: 34px; width: 110px; border-radius: var(--radius); }

  /* ── Empty & Access denied ── */
  .empty-state, .access-denied {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 4rem 1rem;
    gap: 0.75rem;
    color: var(--text-muted);
  }
  .empty-icon { width: 56px; height: 56px; color: var(--text-faint); margin-bottom: 0.5rem; }
  .empty-state h3 { font-size: 1.1rem; font-weight: 700; color: var(--text); margin: 0; }
  .empty-state p { font-size: 0.875rem; margin: 0 0 0.5rem; }
  .access-denied strong { color: var(--text); }

  @media (max-width: 640px) {
    .form-row.two-col { grid-template-columns: 1fr; }
    .events-grid { grid-template-columns: 1fr; }
    .card-footer { flex-direction: column; }
    .card-footer .btn { width: 100%; }
  }
`;
