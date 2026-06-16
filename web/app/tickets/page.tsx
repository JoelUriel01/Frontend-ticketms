'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { API_BASE_URL } from '@/lib/supabase/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketItem {
  id: string;
  eventId: string;
  status: string;
  price: string;
  currency: string;
  ticketType?: string;
  seatLabel?: string;
  seatSection?: string;
  seatRow?: string;
  seatNumber?: number;
  createdAt: string;
  event?: {
    title: string;
    venueName: string;
    venueCity: string;
    startsAt: string;
  };
}

interface OrderDetail {
  id: string;
  status: string;
  totalAmount: string;
  currency: string;
  createdAt: string;
  tickets: TicketItem[];
  event?: {
    title: string;
    venueName: string;
    venueCity: string;
    startsAt: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

const PALETTE = ['#00c2b3','#f5a623','#e05c5c','#7c3aed','#2563eb','#16a34a','#db2777','#ea580c'];
function colorFor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(t: string) {
  return t.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// ─── Ticket Card ──────────────────────────────────────────────────────────────

function TicketCard({ ticket, accentColor, index }: { ticket: TicketItem; accentColor: string; index: number }) {
  const label = ticket.seatLabel
    ? ticket.seatLabel
    : ticket.ticketType ?? 'Entrada General';

  const sublabel = ticket.seatSection
    ? `Sección ${ticket.seatSection} · Fila ${ticket.seatRow} · Asiento ${ticket.seatNumber}`
    : undefined;

  return (
    <div className="ticket-card" style={{ animationDelay: `${index * 60}ms` }}>
      {/* Ticket perforation line */}
      <div className="ticket-perf">
        <div className="perf-circle perf-l" />
        <div className="perf-dash-line" />
        <div className="perf-circle perf-r" />
      </div>

      <div className="ticket-body">
        <div className="ticket-left">
          <div className="ticket-index" style={{ background: accentColor + '22', color: accentColor }}>
            #{String(index + 1).padStart(2, '0')}
          </div>
          <div className="ticket-info">
            <div className="ticket-label">{label}</div>
            {sublabel && <div className="ticket-sublabel">{sublabel}</div>}
            <div className="ticket-id">ID: {ticket.id.slice(0, 8).toUpperCase()}</div>
          </div>
        </div>
        <div className="ticket-right">
          <div className="ticket-price">
            ${Number(ticket.price).toLocaleString('es-MX')}
            <span className="ticket-currency"> {ticket.currency}</span>
          </div>
          <Link
            href={`/tickets/${ticket.id}`}
            className="view-btn"
            style={{ borderColor: accentColor + '55', color: accentColor }}
          >
            Ver QR
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Pulsing Step Indicator ───────────────────────────────────────────────────

function ProcessingStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="proc-step">
      <div className={`proc-dot${done ? ' done' : ' pulse'}`}>
        {done ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <div className="proc-inner-dot" />
        )}
      </div>
      <span className={`proc-label${done ? ' done' : ''}`}>{label}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function TicketsConfirmationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const pago           = searchParams.get('pago');
  const orderId        = searchParams.get('order');
  const redirectStatus = searchParams.get('redirect_status');
  const paymentIntent  = searchParams.get('payment_intent');

  const isCancelled = redirectStatus === 'canceled' || pago === 'cancelado';
  const isSuccess   = redirectStatus === 'succeeded' || pago === 'exitoso';

  const [order, setOrder]       = useState<OrderDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [attempts, setAttempts] = useState(0);
  const [webhookDone, setWebhookDone] = useState(false);
  const [fetchError, setFetchError]   = useState('');

  // ─── Poll order until tickets appear (webhook might be slightly delayed) ───
  const fetchOrder = useCallback(async () => {
    if (!orderId) return;

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        router.replace(`/login?redirectTo=/tickets?pago=exitoso&order=${orderId}`);
        return;
      }

      // GET /tickets/order/:orderId → { id, status, totalAmount, tickets[], event }
      const res = await fetch(`${API_BASE_URL}/tickets/order/${orderId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      const data: OrderDetail = await res.json();
      setOrder(data);

      // Considerar listo si la orden está PAID y ya tiene boletos
      if (data.tickets && data.tickets.length > 0 && data.status === 'PAID') {
        setWebhookDone(true);
        setLoading(false);
      }
    } catch (err: any) {
      // No mostrar error transiente durante el polling
      if (attempts >= 8) {
        setFetchError('No se pudo verificar la orden. Revisa tu correo o ve a Mis boletos.');
        setLoading(false);
      }
    }
  }, [orderId, attempts, router]);

  // Polling logic: retry up to ~16s with exponential backoff
  useEffect(() => {
    if (!isSuccess || webhookDone || !orderId) {
      setLoading(false);
      return;
    }

    const delays = [800, 1500, 2000, 2500, 3000, 3000, 3000, 3000]; // ~16s total
    const delay  = delays[Math.min(attempts, delays.length - 1)];

    const timer = setTimeout(async () => {
      await fetchOrder();
      setAttempts((a) => a + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [isSuccess, attempts, webhookDone, orderId, fetchOrder]);

  // Stop polling after max retries
  useEffect(() => {
    if (attempts > 8 && !webhookDone) {
      setFetchError('Los boletos están siendo procesados. Revisa Mis boletos en unos momentos.');
      setLoading(false);
    }
  }, [attempts, webhookDone]);

  // ─── Derived display values ───────────────────────────────────────────────

  const eventTitle = order?.event?.title ?? order?.tickets?.[0]?.event?.title ?? 'Evento';
  const accentColor = eventTitle ? colorFor(eventTitle) : '#00c2b3';
  const abbr  = initials(eventTitle);
  const eventMeta = order?.event ?? order?.tickets?.[0]?.event;

  // ─── Render: cancelled ────────────────────────────────────────────────────

  if (isCancelled) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="page-root">
          <TopNav />
          <main className="conf-layout">
            <div className="status-icon status-icon--fail">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h1 className="conf-title">Pago cancelado</h1>
            <p className="conf-subtitle">No se realizó ningún cargo. Puedes intentar de nuevo.</p>
            <Link href="/discover" className="cta-btn cta-btn--secondary">
              Regresar a eventos
            </Link>
          </main>
        </div>
      </>
    );
  }

  // ─── Render: not a payment redirect (generic /tickets) ───────────────────

  if (!isSuccess && !orderId) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="page-root">
          <TopNav />
          <main className="conf-layout">
            <p className="conf-subtitle" style={{ marginTop: '4rem' }}>
              Aquí verás tus confirmaciones de compra.
            </p>
            <Link href="/tickets/me" className="cta-btn" style={{ background: '#00c2b3', marginTop: '1rem' }}>
              Ver mis boletos
            </Link>
          </main>
        </div>
      </>
    );
  }

  // ─── Render: success — loading / polling ──────────────────────────────────

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="page-root">
        <TopNav />
        <main className="conf-layout">

          {/* ── Success hero ── */}
          <div className="success-hero">
            <div className="success-ring" style={{ borderColor: accentColor + '44' }}>
              <div className="success-ring-2" style={{ borderColor: accentColor + '22' }}>
                <div className="status-icon status-icon--ok" style={{ background: accentColor }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0e0e0f" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>
            </div>
            <h1 className="conf-title">¡Pago exitoso!</h1>
            <p className="conf-subtitle">
              Tu compra fue procesada. Tus boletos están listos.
            </p>
          </div>

          {/* ── Processing steps ── */}
          {loading && !fetchError && (
            <div className="proc-steps-box">
              <ProcessingStep done label="Pago confirmado por Stripe" />
              <ProcessingStep done={webhookDone} label="Generando tus boletos…" />
            </div>
          )}

          {/* ── Error / fallback ── */}
          {fetchError && (
            <div className="info-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {fetchError}
            </div>
          )}

          {/* ── Event card ── */}
          {order && eventMeta && (
            <div className="event-card" style={{ borderColor: accentColor + '33' }}>
              <div className="ec-banner" style={{ background: `linear-gradient(135deg, ${accentColor}18 0%, #0e0e0f 100%)` }}>
                <div className="ec-avatar" style={{ background: accentColor }}>{abbr}</div>
              </div>
              <div className="ec-body">
                <div className="ec-title">{eventMeta.title}</div>
                <div className="ec-meta">
                  <span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    {fmtDate(eventMeta.startsAt)}, {fmtTime(eventMeta.startsAt)}
                  </span>
                  <span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    {eventMeta.venueName}, {eventMeta.venueCity}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Tickets list ── */}
          {order?.tickets && order.tickets.length > 0 && (
            <section className="tickets-section">
              <div className="section-header">
                <span className="section-label">Tus boletos</span>
                <span className="section-badge" style={{ background: accentColor + '22', color: accentColor }}>
                  {order.tickets.length} {order.tickets.length === 1 ? 'boleto' : 'boletos'}
                </span>
              </div>
              <div className="tickets-list">
                {order.tickets.map((t, i) => (
                  <TicketCard key={t.id} ticket={t} accentColor={accentColor} index={i} />
                ))}
              </div>
            </section>
          )}

          {/* ── Order summary ── */}
          {order && (
            <div className="order-summary-box">
              <div className="osb-row">
                <span className="osb-label">Número de orden</span>
                <span className="osb-value osb-mono">{order.id.slice(0, 8).toUpperCase()}</span>
              </div>
              {paymentIntent && (
                <div className="osb-row">
                  <span className="osb-label">Referencia Stripe</span>
                  <span className="osb-value osb-mono">{paymentIntent.slice(0, 24)}…</span>
                </div>
              )}
              <div className="osb-divider" />
              <div className="osb-row osb-total">
                <span>Total pagado</span>
                <span style={{ color: accentColor }}>
                  ${Number(order.totalAmount).toLocaleString('es-MX')} {order.currency}
                </span>
              </div>
            </div>
          )}

          {/* ── Loading skeleton ── */}
          {loading && !order && !fetchError && (
            <div className="skeleton-list">
              {[0, 1].map((i) => (
                <div key={i} className="skeleton-ticket" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          )}

          {/* ── CTAs ── */}
          <div className="cta-row">
            {order?.tickets?.[0] && (
              <Link
                href={`/tickets/${order.tickets[0].id}`}
                className="cta-btn"
                style={{ background: accentColor }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
                Ver mi boleto
              </Link>
            )}
            <Link href="/tickets/me" className="cta-btn cta-btn--secondary">
              Mis boletos
            </Link>
            <Link href="/discover" className="cta-btn cta-btn--ghost">
              Descubrir más eventos
            </Link>
          </div>

          <p className="fine-print">
            Recibirás un correo de confirmación. Sin reembolsos según los términos de uso.
          </p>

        </main>
      </div>
    </>
  );
}

export default function TicketsConfirmationPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0e0e0f' }} />}>
      <TicketsConfirmationContent />
    </Suspense>
  );
}


// ─── Top Nav ──────────────────────────────────────────────────────────────────

function TopNav() {
  return (
    <nav className="top-nav">
      <div className="nav-inner">
        <Link href="/discover" className="back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Inicio
        </Link>
        <span className="nav-title">Confirmación de compra</span>
      </div>
    </nav>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');
  :root {
    --bg: #0e0e0f; --surface: #141415; --surface-2: #1a1a1c; --surface-3: #212124;
    --border: oklch(1 0 0 / 0.08); --border-hover: oklch(1 0 0 / 0.16);
    --text: #e8e8e9; --text-muted: #8a8a8e; --text-faint: #4a4a50;
    --accent: #00c2b3;
    --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px; --radius-xl: 18px;
    --tr: 180ms cubic-bezier(0.16, 1, 0.3, 1);
    --font: 'Satoshi', 'Inter', system-ui, sans-serif;
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

  /* NAV */
  .top-nav {
    border-bottom: 1px solid var(--border);
    padding: 0.85rem clamp(1rem, 4vw, 2.5rem);
    position: sticky; top: 0;
    background: oklch(0.1 0 0 / 0.85);
    backdrop-filter: blur(12px);
    z-index: 50;
  }
  .nav-inner {
    max-width: 640px; margin: 0 auto; width: 100%;
    display: flex; align-items: center; justify-content: space-between;
  }
  .back-btn {
    display: inline-flex; align-items: center; gap: 0.4rem;
    color: var(--text-muted); font-size: 0.875rem; font-weight: 500;
    text-decoration: none; transition: color var(--tr);
  }
  .back-btn:hover { color: var(--text); }
  .nav-title { font-size: 0.875rem; font-weight: 600; color: var(--text-muted); }

  /* LAYOUT */
  .conf-layout {
    max-width: 560px; margin: 0 auto;
    padding: 2.5rem clamp(1rem, 4vw, 1.5rem) 5rem;
    display: flex; flex-direction: column; gap: 1.25rem;
  }

  /* SUCCESS HERO */
  .success-hero {
    display: flex; flex-direction: column; align-items: center;
    gap: 0.75rem; padding: 1rem 0 0.5rem; text-align: center;
  }
  .success-ring {
    width: 100px; height: 100px; border-radius: 50%;
    border: 2px solid; display: flex; align-items: center; justify-content: center;
    animation: ring-in 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .success-ring-2 {
    width: 80px; height: 80px; border-radius: 50%;
    border: 2px solid; display: flex; align-items: center; justify-content: center;
  }
  @keyframes ring-in {
    from { opacity: 0; transform: scale(0.6); }
    to   { opacity: 1; transform: scale(1); }
  }
  .status-icon {
    width: 60px; height: 60px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    animation: pop-in 400ms 100ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .status-icon--ok  { /* color set inline */ }
  .status-icon--fail { background: #7f1d1d; color: #fca5a5; }
  @keyframes pop-in {
    from { opacity: 0; transform: scale(0.5); }
    65%  { transform: scale(1.12); }
    to   { opacity: 1; transform: scale(1); }
  }

  .conf-title {
    font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em;
    color: var(--text); animation: fade-up 400ms 200ms both;
  }
  .conf-subtitle {
    font-size: 0.9rem; color: var(--text-muted);
    animation: fade-up 400ms 280ms both;
  }
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* PROCESSING STEPS */
  .proc-steps-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 1rem 1.25rem;
    display: flex; flex-direction: column; gap: 0.75rem;
  }
  .proc-step { display: flex; align-items: center; gap: 0.75rem; }
  .proc-dot {
    width: 22px; height: 22px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .proc-dot.done { background: #14532d; color: #4ade80; }
  .proc-dot.pulse {
    background: var(--surface-3); border: 1px solid var(--border);
    animation: pulse-ring 1.2s cubic-bezier(0.4,0,0.6,1) infinite;
  }
  .proc-inner-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent); animation: pulse-dot 1.2s ease infinite;
  }
  @keyframes pulse-ring {
    0%, 100% { box-shadow: 0 0 0 0 var(--accent, #00c2b3)44; }
    50%       { box-shadow: 0 0 0 4px var(--accent, #00c2b3)00; }
  }
  @keyframes pulse-dot { 0%,100%{opacity:1}50%{opacity:.4} }
  .proc-label { font-size: 0.85rem; color: var(--text-muted); }
  .proc-label.done { color: #4ade80; }

  /* INFO BANNER */
  .info-banner {
    display: flex; align-items: center; gap: 0.6rem;
    background: oklch(0.35 0.06 220 / 0.15);
    border: 1px solid oklch(0.5 0.06 220 / 0.3);
    border-radius: var(--radius-lg);
    padding: 0.75rem 1rem;
    font-size: 0.875rem; color: #93c5fd;
  }

  /* EVENT CARD */
  .event-card {
    background: var(--surface);
    border: 1px solid;
    border-radius: var(--radius-xl);
    overflow: hidden;
    animation: fade-up 300ms 100ms both;
  }
  .ec-banner {
    height: 60px; display: flex; align-items: flex-end;
    padding: 0 1.25rem 0.75rem;
  }
  .ec-avatar {
    width: 40px; height: 40px; border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.8rem; font-weight: 700; color: #0e0e0f;
    box-shadow: 0 2px 8px oklch(0 0 0 / 0.4);
  }
  .ec-body { padding: 0.75rem 1.25rem 1rem; }
  .ec-title { font-size: 0.95rem; font-weight: 700; color: var(--text); margin-bottom: 0.4rem; }
  .ec-meta { display: flex; flex-direction: column; gap: 0.25rem; }
  .ec-meta span {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.78rem; color: var(--text-muted);
  }

  /* TICKETS SECTION */
  .tickets-section { display: flex; flex-direction: column; gap: 0.75rem; }
  .section-header { display: flex; align-items: center; gap: 0.6rem; }
  .section-label {
    font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--text-faint);
  }
  .section-badge {
    font-size: 0.65rem; font-weight: 700; border-radius: 9999px;
    padding: 2px 8px;
  }
  .tickets-list { display: flex; flex-direction: column; gap: 0.5rem; }

  /* TICKET CARD */
  .ticket-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    overflow: hidden;
    animation: slide-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
    position: relative;
  }
  @keyframes slide-in {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .ticket-perf {
    display: flex; align-items: center;
    padding: 0 12px; height: 1px;
    position: relative; overflow: visible;
    background: transparent;
  }
  .perf-circle {
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--bg); border: 1px solid var(--border);
    position: absolute; top: -7px; z-index: 1;
  }
  .perf-l { left: -7px; }
  .perf-r { right: -7px; }
  .perf-dash-line {
    flex: 1; height: 1px; margin: 0 7px;
    background: repeating-linear-gradient(
      to right,
      var(--border) 0, var(--border) 6px,
      transparent 6px, transparent 12px
    );
  }
  .ticket-body {
    display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; padding: 0.9rem 1.1rem;
  }
  .ticket-left { display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0; }
  .ticket-index {
    width: 36px; height: 36px; border-radius: var(--radius-sm);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; flex-shrink: 0;
  }
  .ticket-info { min-width: 0; }
  .ticket-label { font-size: 0.875rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ticket-sublabel { font-size: 0.75rem; color: var(--text-muted); margin-top: 1px; }
  .ticket-id { font-size: 0.68rem; color: var(--text-faint); font-family: monospace; margin-top: 3px; letter-spacing: 0.04em; }
  .ticket-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.4rem; flex-shrink: 0; }
  .ticket-price { font-size: 0.9rem; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ticket-currency { font-size: 0.72rem; font-weight: 500; color: var(--text-muted); }
  .view-btn {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-size: 0.75rem; font-weight: 600; text-decoration: none;
    border: 1px solid; border-radius: 9999px;
    padding: 0.25rem 0.75rem;
    transition: background var(--tr), opacity var(--tr);
    white-space: nowrap;
  }
  .view-btn:hover { opacity: 0.75; }

  /* ORDER SUMMARY BOX */
  .order-summary-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 1rem 1.25rem;
    display: flex; flex-direction: column; gap: 0.6rem;
  }
  .osb-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; }
  .osb-label { color: var(--text-muted); }
  .osb-value { color: var(--text); }
  .osb-mono { font-family: monospace; font-size: 0.78rem; letter-spacing: 0.04em; }
  .osb-divider { height: 1px; background: var(--border); }
  .osb-total { font-size: 0.95rem; font-weight: 700; color: var(--text); }

  /* SKELETONS */
  .skeleton-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .skeleton-ticket {
    height: 80px; border-radius: var(--radius-xl);
    background: linear-gradient(90deg, var(--surface) 25%, var(--surface-3) 50%, var(--surface) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }
  @keyframes shimmer { from{background-position:200% 0} to{background-position:-200% 0} }

  /* CTAs */
  .cta-row { display: flex; flex-direction: column; gap: 0.6rem; }
  .cta-btn {
    width: 100%; padding: 0.9rem; border: none; border-radius: var(--radius-lg);
    color: #0e0e0f; font-family: var(--font); font-size: 0.9rem; font-weight: 700;
    cursor: pointer; text-decoration: none; text-align: center;
    display: flex; align-items: center; justify-content: center; gap: 0.5rem;
    transition: opacity var(--tr), transform var(--tr);
  }
  .cta-btn:hover { opacity: 0.85; transform: translateY(-1px); }
  .cta-btn:active { transform: translateY(0); }
  .cta-btn--secondary {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
  }
  .cta-btn--ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
  }
  .cta-btn--ghost:hover { color: var(--text); background: var(--surface-2); }

  /* FINE PRINT */
  .fine-print { font-size: 0.72rem; color: var(--text-faint); text-align: center; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; }
  }
`;
