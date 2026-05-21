'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { API_BASE_URL } from '@/lib/supabase/api';


interface Ticket {
  id: string;
  eventId: string;
  orderId: string;
  ownerId: string;
  quantity: number;
  status: string;
  createdAt: string;
  price: string;
  currency: string;
  event?: {
    id: string;
    title: string;
    venueName: string;
    venueCity: string;
    startsAt: string;
  };
  order?: {
    id: string;
    totalAmount: string;
    currency: string;
    status: string;
  };
}

interface EventGroup {
  eventId: string;
  title: string;
  venueName: string;
  venueCity: string;
  startsAt: string;
  tickets: Ticket[];
  color: string;
  abbr: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PALETTE = ['#00c2b3', '#f5a623', '#e05c5c', '#7c3aed', '#2563eb', '#16a34a', '#db2777', '#ea580c'];

function colorFor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initials(t: string) {
  return t.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function groupTicketsByEvent(tickets: Ticket[]): EventGroup[] {
  const map = new Map<string, EventGroup>();
  for (const t of tickets) {
    const key = t.eventId;
    const title = t.event?.title ?? 'Evento';
    if (!map.has(key)) {
      map.set(key, {
        eventId: key,
        title,
        venueName: t.event?.venueName ?? '—',
        venueCity: t.event?.venueCity ?? '—',
        startsAt: t.event?.startsAt ?? '',
        tickets: [],
        color: colorFor(title),
        abbr: initials(title),
      });
    }
    map.get(key)!.tickets.push(t);
  }
  return Array.from(map.values());
}

function StatusPill({ status }: { status: string }) {
  const s = (status ?? 'active').toLowerCase();
  return <span className={`status-pill status-${s}`}>{status}</span>;
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  const shortId = ticket.id.slice(0, 8).toUpperCase();
  return (
    <Link href={`/tickets/${ticket.id}`} className="ticket-row-item">
      <div className="ticket-row-left">
        <span className="ticket-code">#{shortId}</span>
        <StatusPill status={ticket.status} />
      </div>
      <div className="ticket-row-right">
        <span className="ticket-price">
          ${Number(ticket.price).toLocaleString('es-MX')} {ticket.currency}
        </span>
        <svg className="ticket-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  );
}

function EventCard({ group, index }: { group: EventGroup; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    // GSAP entrance animation
    if (typeof window === 'undefined') return;
    import('gsap').then(({ gsap }) => {
      if (cardRef.current) {
        gsap.fromTo(
          cardRef.current,
          { opacity: 0, y: 40, scale: 0.97 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.6,
            delay: index * 0.1,
            ease: 'power3.out',
          }
        );
      }
    });
  }, [index]);

  const totalCost = group.tickets.reduce((sum, t) => sum + Number(t.price), 0);
  const activeCount = group.tickets.filter((t) => (t.status ?? '').toLowerCase() === 'active').length;

  return (
    <div ref={cardRef} className="event-card" style={{ '--accent-color': group.color } as React.CSSProperties}>
      <div className="event-card-header" onClick={() => setExpanded((v) => !v)}>
        <div className="event-header-left">
          <div className="event-avatar" style={{ background: group.color }}>
            {group.abbr}
          </div>
          <div className="event-meta">
            <h2 className="event-title">{group.title}</h2>
            {group.startsAt && (
              <p className="event-datetime">
                {fmtDate(group.startsAt)} · {fmtTime(group.startsAt)}
              </p>
            )}
            <p className="event-venue">
              {group.venueName}
              {group.venueCity ? `, ${group.venueCity}` : ''}
            </p>
          </div>
        </div>

        <div className="event-header-right">
          <div className="event-stats">
            <div className="stat-chip">
              <span className="stat-num">{group.tickets.length}</span>
              <span className="stat-label">{group.tickets.length === 1 ? 'boleto' : 'boletos'}</span>
            </div>
            {activeCount > 0 && (
              <div className="stat-chip stat-active">
                <span className="stat-num">{activeCount}</span>
                <span className="stat-label">activos</span>
              </div>
            )}
          </div>
          <svg
            className={`chevron-icon ${expanded ? 'chevron-open' : ''}`}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="event-card-body">
          <div className="tickets-list">
            {group.tickets.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </div>
          <div className="event-card-footer">
            <span className="footer-label">Total pagado</span>
            <span className="footer-total">
              ${totalCost.toLocaleString('es-MX')} {group.tickets[0]?.currency ?? ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    import('gsap').then(({ gsap }) => {
      if (headerRef.current) {
        gsap.fromTo(
          headerRef.current.querySelectorAll('.anim-header > *'),
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, stagger: 0.12, duration: 0.7, ease: 'power3.out' }
        );
      }
    });
  }, []);

  useEffect(() => {
    async function loadTickets() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
          setError('Tu sesión expiró. Inicia sesión nuevamente.');
          return;
        }

const res = await fetch(`${API_BASE_URL}/tickets/me`, {
  headers: { Authorization: `Bearer ${session.access_token}` },
}); 

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'No se pudieron cargar tus boletos');
        }

        const data = await res.json();
        setTickets(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setError(e.message ?? 'Ocurrió un error al cargar tus boletos.');
      } finally {
        setLoading(false);
      }
    }
    loadTickets();
  }, []);

  const groups = groupTicketsByEvent(tickets);
  const totalTickets = tickets.length;
  const totalEvents = groups.length;

  return (
    <>
      <style>{CSS}</style>
      <div className="page-root">
        <nav className="top-nav">
          <div className="nav-inner">
            <Link href="/discover" className="back-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Descubrir
            </Link>
            <span className="nav-title">Mis boletos</span>
          </div>
        </nav>

        <main className="tickets-layout">
          <header ref={headerRef} className="tickets-header">
            <div className="anim-header">
              <h1 className="tickets-title">Mis boletos</h1>
              <p className="tickets-subtitle">Aquí verás todos los boletos que has adquirido.</p>
              {!loading && !error && tickets.length > 0 && (
                <div className="summary-pills">
                  <span className="summary-pill">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M3 10h18" />
                    </svg>
                    {totalEvents} {totalEvents === 1 ? 'evento' : 'eventos'}
                  </span>
                  <span className="summary-pill">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V9z" />
                    </svg>
                    {totalTickets} {totalTickets === 1 ? 'boleto' : 'boletos'}
                  </span>
                </div>
              )}
            </div>
          </header>

          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
            </div>
          ) : error ? (
            <div className="error-state">
              <p>{error}</p>
              <Link href="/discover" className="action-btn">← Volver a descubrir eventos</Link>
            </div>
          ) : tickets.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V9z" />
                  <path d="M13 5v2M13 17v2M13 11v2" />
                </svg>
              </div>
              <h2>Sin boletos todavía</h2>
              <p>Cuando adquieras un boleto, aparecerá aquí.</p>
              <Link href="/discover" className="action-btn">Descubrir eventos</Link>
            </div>
          ) : (
            <div className="events-list">
              {groups.map((group, i) => (
                <EventCard key={group.eventId} group={group} index={i} />
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

const CSS = `
:root {
  --bg: #050507;
  --panel: #0e0e12;
  --panel-2: #13131a;
  --border: #1e1e28;
  --border-subtle: rgba(255,255,255,.05);
  --text: #f0f0f2;
  --muted: #8888a0;
  --soft: #5a5a6a;
  --accent: #7c3aed;
  --success: #22c55e;
  --danger: #ef4444;
  --info: #3b82f6;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: var(--bg);
  color: var(--text);
  font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { text-decoration: none; color: inherit; }

/* ── Page background ── */
.page-root {
  min-height: 100vh;
  background:
    radial-gradient(ellipse 80% 40% at 50% -10%, rgba(124,58,237,.12), transparent),
    linear-gradient(180deg, #050507 0%, #08080c 100%);
}

/* ── Nav ── */
.top-nav {
  position: sticky;
  top: 0;
  z-index: 20;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  background: rgba(5,5,7,.75);
  border-bottom: 1px solid var(--border-subtle);
}
.nav-inner {
  max-width: 760px;
  margin: 0 auto;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 14px;
  transition: color .2s;
}
.back-btn:hover { color: var(--text); }
.nav-title { font-size: 14px; color: #c4c4d0; font-weight: 600; }

/* ── Layout ── */
.tickets-layout {
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 24px 100px;
}

/* ── Header ── */
.tickets-header { margin-bottom: 36px; }
.tickets-title {
  font-size: 42px;
  font-weight: 800;
  letter-spacing: -.04em;
  line-height: 1;
}
.tickets-subtitle {
  margin-top: 10px;
  color: var(--muted);
  font-size: 15px;
}
.summary-pills {
  display: flex;
  gap: 10px;
  margin-top: 18px;
  flex-wrap: wrap;
}
.summary-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: #c4c4d0;
  background: rgba(255,255,255,.05);
  border: 1px solid var(--border);
}

/* ── States ── */
.loading-state,
.error-state,
.empty-state {
  min-height: 52vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
}
.spinner {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 3px solid rgba(255,255,255,.07);
  border-top-color: var(--accent);
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.empty-icon {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  color: var(--muted);
  border: 1px solid var(--border);
  background: var(--panel);
  margin-bottom: 8px;
}
.empty-state h2 { font-size: 28px; letter-spacing: -.03em; }
.empty-state p, .error-state p { color: var(--muted); font-size: 15px; }
.action-btn {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 22px;
  border-radius: 999px;
  border: 1px solid rgba(124,58,237,.4);
  font-size: 14px;
  color: #d8b4fe;
  transition: background .2s, border-color .2s;
}
.action-btn:hover { background: rgba(124,58,237,.12); border-color: rgba(124,58,237,.7); }

/* ── Events list ── */
.events-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Event card ── */
.event-card {
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--panel);
  overflow: hidden;
  opacity: 0; /* GSAP animates this to 1 */
  transition: border-color .25s;
}
.event-card:hover {
  border-color: rgba(var(--accent-color, 124,58,237), .3);
}

/* Header (clickable) */
.event-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px;
  cursor: pointer;
  user-select: none;
  transition: background .2s;
}
.event-card-header:hover { background: rgba(255,255,255,.02); }

.event-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
}

.event-avatar {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 17px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -.02em;
  box-shadow: inset 0 -6px 14px rgba(0,0,0,.2);
}

.event-meta { min-width: 0; }
.event-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -.025em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.event-datetime {
  margin-top: 4px;
  font-size: 13px;
  color: var(--muted);
  text-transform: capitalize;
}
.event-venue {
  margin-top: 2px;
  font-size: 12px;
  color: var(--soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-header-right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}
.event-stats { display: flex; gap: 8px; }
.stat-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 7px 14px;
  border-radius: 10px;
  background: rgba(255,255,255,.04);
  border: 1px solid var(--border);
  min-width: 52px;
}
.stat-chip.stat-active {
  background: rgba(34,197,94,.08);
  border-color: rgba(34,197,94,.2);
}
.stat-num {
  font-size: 17px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -.03em;
}
.stat-active .stat-num { color: #86efac; }
.stat-label {
  font-size: 10px;
  color: var(--soft);
  margin-top: 2px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: .05em;
}

.chevron-icon {
  color: var(--soft);
  transition: transform .3s ease;
  flex-shrink: 0;
}
.chevron-open { transform: rotate(180deg); }

/* Body */
.event-card-body {
  border-top: 1px solid var(--border);
  animation: slideDown .25s ease;
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Tickets list */
.tickets-list { padding: 6px 0; }

.ticket-row-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 22px;
  transition: background .15s;
  border-bottom: 1px solid rgba(255,255,255,.03);
  cursor: pointer;
}
.ticket-row-item:last-child { border-bottom: none; }
.ticket-row-item:hover { background: rgba(255,255,255,.03); }

.ticket-row-left { display: flex; align-items: center; gap: 12px; }
.ticket-code {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 13px;
  color: #c0c0d0;
  letter-spacing: .04em;
}
.ticket-row-right { display: flex; align-items: center; gap: 10px; }
.ticket-price {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.ticket-arrow { color: var(--soft); }

/* Status pills */
.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.status-active  { color: #86efac; background: rgba(34,197,94,.1);  border: 1px solid rgba(34,197,94,.2); }
.status-used    { color: #93c5fd; background: rgba(59,130,246,.1); border: 1px solid rgba(59,130,246,.2); }
.status-revoked { color: #fca5a5; background: rgba(239,68,68,.1);  border: 1px solid rgba(239,68,68,.2); }

/* Footer */
.event-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 22px;
  border-top: 1px solid var(--border);
  background: rgba(255,255,255,.018);
}
.footer-label { font-size: 13px; color: var(--muted); }
.footer-total { font-size: 15px; font-weight: 700; color: var(--text); }

/* ── Responsive ── */
@media (max-width: 600px) {
  .tickets-layout { padding: 28px 16px 80px; }
  .tickets-title { font-size: 34px; }
  .event-card-header { flex-wrap: wrap; }
  .event-header-right { width: 100%; justify-content: flex-end; }
  .stat-chip { padding: 6px 12px; min-width: 46px; }
  .event-title { font-size: 16px; }
}
`;
