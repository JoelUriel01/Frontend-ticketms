'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import QRCode from 'react-qr-code';
import { API_BASE_URL } from '@/lib/supabase/api';


interface Ticket {
  id: string;
  eventId: string;
  buyerId: string;
  quantity: number;
  status: string;
  createdAt: string;
  price: string;        // ← agregar: precio de este boleto
  currency: string;     // ← agregar
  orderId?: string;
  order?: {
    id: string;
    totalAmount: string;
    currency: string;
    status: string;
  };
  seat?: {             // ← agregar: asiento asignado (modo mapa)
    id: string;
    row: string;
    number: number;
    seatLabel: string;
    section?: { code: string; label: string };
  };
  event?: {
    id: string;
    title: string;
    venueName: string;
    venueCity: string;
    startsAt: string;
  };
  buyer?: {
    id: string;
    fullName: string;
    email: string;
  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

const PALETTE = ['#00c2b3','#f5a623','#e05c5c','#7c3aed','#2563eb','#16a34a','#db2777','#ea580c'];
function colorFor(str: string) {
  let h = 0; for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(t: string) { return t.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }

function ConfettiCanvas({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = Array.from({ length: 100 }, () => ({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * 100,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      color: ['#00c2b3','#f5a623','#e05c5c','#7c3aed','#16a34a'][Math.floor(Math.random()*5)],
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      r: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.2,
    }));
    let raf: number;
    let frame = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / 160);
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
      });
      frame++;
      if (frame < 180) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return <canvas ref={ref} className="confetti-canvas" aria-hidden="true" />;
}

export default function TicketDetailPage() {
  const params      = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const isNew       = searchParams.get('new') === '1';
  const id          = params?.id;

  const [ticket,  setTicket]  = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNF]     = useState(false);
  const [confetti, setConfetti] = useState(false);

  const [qrToken, setQrToken] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');

  const color = ticket?.event ? colorFor(ticket.event.title) : '#00c2b3';
  const abbr  = ticket?.event ? initials(ticket.event.title) : '';
  const total = ticket?.order
  ? Number(ticket.order.totalAmount)
  : Number(ticket?.price ?? 0);

  const currency = ticket?.order?.currency ?? ticket?.currency ?? 'MXN';
  const shortId = ticket?.id.slice(0, 8).toUpperCase() ?? '';
  
  const normalizedStatus = (ticket?.status ?? 'PENDING').toUpperCase();
  const isUsed = normalizedStatus === 'USED';
  const isBlocked = ['USED', 'REVOKED', 'EXPIRED'].includes(normalizedStatus);


  async function loadQrToken(ticketId: string) {
  try {
    setQrLoading(true);
    setQrError('');

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setQrError('Tu sesión expiró. Inicia sesión nuevamente.');
      return;
    }

    const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}/qr-token`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data) {
      throw new Error(data?.message || 'No se pudo generar el QR dinámico.');
    }

    setQrToken(data.token);
    setQrExpiresAt(data.expiresAt);
  } catch (e: any) {
    setQrError(e.message ?? 'No se pudo generar el QR dinámico.');
    setQrToken('');
    setQrExpiresAt('');
  } finally {
    setQrLoading(false);
  }
}

useEffect(() => {
  if (!ticket?.id) return;
  if (isBlocked) {
    setQrToken('');
    setQrExpiresAt('');
    return;
  }

  let intervalId: NodeJS.Timeout;

  loadQrToken(ticket.id);
  intervalId = setInterval(() => {
    loadQrToken(ticket.id);
  }, 25000);

  return () => clearInterval(intervalId);
}, [ticket?.id, isBlocked]);

useEffect(() => {
  async function loadTicket() {
    if (!id) return;

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setNF(true);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/tickets/${id}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (res.status === 404) {
        setNF(true);
        return;
      }

      if (!res.ok) {
        throw new Error('No se pudo cargar el boleto');
      }

      const data = await res.json();
      setTicket(data);
    } catch {
      setNF(true);
    } finally {
      setLoading(false);
    }
  }

  loadTicket();
}, [id]);

  useEffect(() => {
    if (isNew && !loading && ticket) {
      setTimeout(() => setConfetti(true), 300);
    }
  }, [isNew, loading, ticket]);


return (
  <>
    <style>{CSS}</style>
    <ConfettiCanvas active={confetti} />

    <div className="page-root">
      <nav className="top-nav">
        <div className="nav-inner">
          <Link href="/tickets/me" className="back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Mis boletos
          </Link>
        </div>
      </nav>

      <main className="ticket-layout">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
          </div>
        ) : notFound || !ticket ? (
          <div className="error-state">
            <p>No se encontró el boleto.</p>
            <Link href="/tickets/me" className="back-link">
              ← Ver mis boletos
            </Link>
          </div>
        ) : (
          <>
            {isNew && (
              <div className="success-banner" role="status">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Compra exitosa. Tu boleto está listo.
              </div>
            )}

            <div
              className="ticket-card"
              style={{ '--accent-color': color } as React.CSSProperties}
            >
              <div
                className="ticket-header"
                style={{ background: `linear-gradient(135deg, ${color}28 0%, #1a1a1c 100%)` }}
              >
                <div className="ticket-avatar" style={{ background: color }}>
                  {abbr}
                </div>

                <div className="ticket-event-info">
                  <h1 className="ticket-event-title">{ticket.event?.title ?? '—'}</h1>
                  {ticket.event && (
                    <p className="ticket-event-meta">
                      {fmtDate(ticket.event.startsAt)}, {fmtTime(ticket.event.startsAt)}
                    </p>
                  )}
                </div>
              </div>

              <div className="ticket-perforation" aria-hidden="true">
                <div className="notch left" />
                <div className="dashed-line" />
                <div className="notch right" />
              </div>

              <div className="ticket-body">
                <div className="ticket-sections">
                  <section className="ticket-section">
                    <h2 className="ticket-section-title">Evento</h2>

                    <div className="ticket-fields">
                      <div className="ticket-field">
                        <span className="field-label">Fecha</span>
                        <span className="field-value">
                          {ticket.event ? fmtDate(ticket.event.startsAt) : '—'}
                        </span>
                      </div>

                      <div className="ticket-field">
                        <span className="field-label">Hora</span>
                        <span className="field-value">
                          {ticket.event ? fmtTime(ticket.event.startsAt) : '—'}
                        </span>
                      </div>

                      <div className="ticket-field">
                        <span className="field-label">Recinto</span>
                        <span className="field-value">{ticket.event?.venueName ?? '—'}</span>
                      </div>

                      <div className="ticket-field">
                        <span className="field-label">Ciudad</span>
                        <span className="field-value">{ticket.event?.venueCity ?? '—'}</span>
                      </div>

                      {ticket.seat && (
                        <div className="ticket-field">
                          <span className="field-label">Asiento</span>
                          <span className="field-value">
                            {ticket.seat.seatLabel ?? ticket.seat.id}
                            {ticket.seat.section ? ` · ${ticket.seat.section.label}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="ticket-section">
                    <h2 className="ticket-section-title">Boleto</h2>

                    <div className="ticket-fields">
                      <div className="ticket-field">
                        <span className="field-label">Folio</span>
                        <span className="field-value">#{shortId}</span>
                      </div>

                      <div className="ticket-field">
                        <span className="field-label">Cantidad</span>
                        <span className="field-value">
                          {ticket.quantity} boleto{ticket.quantity !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="ticket-field">
                        <span className="field-label">Estado</span>
                        <span className={`status-badge status-${(ticket.status ?? 'pending').toLowerCase()}`}>
                          {ticket.status ?? 'PENDING'}
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="ticket-section">
                    <h2 className="ticket-section-title">Compra</h2>

                    <div className="ticket-fields">
                      <div className="ticket-field">
                        <span className="field-label">Titular</span>
                        <span className="field-value">{ticket.buyer?.fullName ?? '—'}</span>
                      </div>

                      <div className="ticket-field">
                        <span className="field-label">Correo</span>
                        <span className="field-value">{ticket.buyer?.email ?? '—'}</span>
                      </div>

                      {ticket.order?.id && (
                        <div className="ticket-field">
                          <span className="field-label">Orden</span>
                          <span className="field-value">
                            #{ticket.order.id.slice(0, 8).toUpperCase()}
                          </span>
                        </div>
                      )}

                      <div className="ticket-field">
                        <span className="field-label">Total pagado</span>
                        <span className="field-value accent">
                          {total.toLocaleString('es-MX', {
                            style: 'currency',
                            currency,
                          })}
                        </span>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="ticket-qr-section">
                  {isBlocked ? (
                    <div className={`qr-blocked qr-${normalizedStatus.toLowerCase()}`}>
                      <div className="qr-blocked-icon">
                        {isUsed ? (
                          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M9 12l2 2 4-4" />
                            <circle cx="12" cy="12" r="9" />
                          </svg>
                        ) : (
                          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M8.5 8.5l7 7" />
                            <path d="M15.5 8.5l-7 7" />
                          </svg>
                        )}
                      </div>

                      <p className="qr-blocked-title">
                        {normalizedStatus === 'USED'
                          ? 'Este boleto ya fue utilizado'
                          : normalizedStatus === 'REVOKED'
                          ? 'Este boleto fue revocado'
                          : 'Este boleto expiró'}
                      </p>

                      <p className="ticket-code-note">
                        {normalizedStatus === 'USED'
                          ? 'El código QR dejó de mostrarse porque ya no puede volver a usarse.'
                          : 'Este boleto ya no es válido para ingreso.'}
                      </p>
                    </div>
                  ) : qrLoading && !qrToken ? (
                    <div className="qr-loading">
                      <div className="spinner small" />
                      <p className="ticket-code-note">Generando código seguro...</p>
                    </div>
                  ) : qrError ? (
                    <div className="qr-blocked qr-expired">
                      <div className="qr-blocked-icon">
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M8.5 8.5l7 7" />
                          <path d="M15.5 8.5l-7 7" />
                        </svg>
                      </div>

                      <p className="qr-blocked-title">No se pudo generar el QR</p>
                      <p className="ticket-code-note">{qrError}</p>
                    </div>
                  ) : (
                    <>
                      <div className="qr-real">
                        <QRCode
                          value={qrToken}
                          size={140}
                          bgColor="transparent"
                          fgColor={color}
                        />
                      </div>

                      <p className="ticket-code">#{shortId}</p>
                      <p className="ticket-code-note">
                        Este código se actualiza automáticamente.
                      </p>

                      {qrExpiresAt ? (
                        <p className="ticket-code-note subtle">
                          Válido hasta: {new Date(qrExpiresAt).toLocaleTimeString('es-MX')}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="ticket-actions">
              <Link href="/discover" className="action-btn secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Descubrir más eventos
              </Link>

              <Link
                href="/tickets/me"
                className="action-btn primary"
                style={{ background: color }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
                  <polyline points="14,2 20,2 20,8" />
                  <line x1="10" y1="14" x2="20" y2="4" />
                </svg>
                Ver todos mis boletos
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  </>
);
}
const CSS = `

.ticket-body {
  padding: 1rem 1.25rem 1.25rem;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1.25rem;
  align-items: start;
}

.ticket-sections {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ticket-section {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px;
  padding: 0.9rem;
}

.ticket-section-title {
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 0.75rem;
}

.ticket-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem 1rem;
}

.ticket-field {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.field-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.field-value {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text);
  word-break: break-word;
}

.field-value.accent {
  color: var(--accent-color, var(--accent));
  font-weight: 700;
}

@media (max-width: 640px) {
  .ticket-body {
    grid-template-columns: 1fr;
  }

  .ticket-fields {
    grid-template-columns: 1fr;
  }

  .ticket-qr-section {
    margin-top: 0.5rem;
  }
}

.qr-loading{
  min-height: 220px;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,.08);
  background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015));
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding:24px 18px;
}

.spinner.small{
  width: 26px;
  height: 26px;
  margin-bottom: 10px;
}

.ticket-code-note.subtle{
  opacity: .72;
  font-size: .84rem;
}
  .qr-blocked{
  min-height: 220px;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,.08);
  background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px 18px;
}

.qr-blocked-icon{
  width: 72px;
  height: 72px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  margin-bottom: 14px;
}

.qr-used .qr-blocked-icon{
  color: #f5a623;
  background: rgba(245,166,35,.12);
  border: 1px solid rgba(245,166,35,.22);
}

.qr-revoked .qr-blocked-icon,
.qr-expired .qr-blocked-icon{
  color: #e05c5c;
  background: rgba(224,92,92,.12);
  border: 1px solid rgba(224,92,92,.22);
}

.qr-blocked-title{
  margin: 0 0 8px;
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}
  @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');
  :root{--bg:#0e0e0f;--surface:#141415;--surface-2:#1a1a1c;--surface-3:#212124;--border:oklch(1 0 0/0.08);--text:#e8e8e9;--text-muted:#8a8a8e;--text-faint:#4a4a50;--accent:#00c2b3;--radius-sm:6px;--radius-md:10px;--radius-lg:14px;--radius-xl:18px;--tr:180ms cubic-bezier(0.16,1,0.3,1);--font:'Satoshi','Inter',system-ui,sans-serif;}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  .page-root{min-height:100vh;background:var(--bg);color:var(--text);font-family:var(--font);font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased;}
  .confetti-canvas{position:fixed;inset:0;pointer-events:none;z-index:1000;}
  .top-nav{border-bottom:1px solid var(--border);padding:0.85rem clamp(1rem,4vw,2.5rem);position:sticky;top:0;background:oklch(0.1 0 0/0.85);backdrop-filter:blur(12px);z-index:10;}
  .nav-inner{max-width:520px;margin:0 auto;}
  .back-btn{display:inline-flex;align-items:center;gap:0.4rem;color:var(--text-muted);font-size:0.875rem;font-weight:500;text-decoration:none;transition:color var(--tr);}
  .back-btn:hover{color:var(--text);}
  .ticket-layout{max-width:520px;margin:0 auto;padding:2rem clamp(1rem,4vw,1.5rem) 4rem;display:flex;flex-direction:column;gap:1rem;}
  .success-banner{display:flex;align-items:center;gap:0.6rem;background:oklch(0.35 0.1 165/0.15);border:1px solid oklch(0.45 0.15 165/0.4);border-radius:var(--radius-lg);padding:0.8rem 1rem;font-size:0.875rem;font-weight:600;color:#4ade80;animation:slideDown 0.4s cubic-bezier(0.16,1,0.3,1);}
  @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
  .ticket-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);overflow:hidden;box-shadow:0 12px 40px oklch(0 0 0/0.3);}
  .ticket-header{padding:1.25rem 1.25rem 1rem;display:flex;align-items:flex-start;gap:0.875rem;}
  .ticket-avatar{width:48px;height:48px;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:0.9rem;font-weight:700;color:#0e0e0f;flex-shrink:0;box-shadow:0 2px 8px oklch(0 0 0/0.4);}
  .ticket-event-info{display:flex;flex-direction:column;gap:0.2rem;}
  .ticket-event-title{font-size:1rem;font-weight:700;color:var(--text);letter-spacing:-0.01em;line-height:1.25;}
  .ticket-event-meta{font-size:0.78rem;color:var(--text-muted);}
  .ticket-perforation{display:flex;align-items:center;padding:0 0;position:relative;height:20px;}
  .notch{width:18px;height:18px;border-radius:9999px;background:var(--bg);flex-shrink:0;border:1px solid var(--border);}
  .notch.left{margin-left:-9px;}
  .notch.right{margin-right:-9px;}
  .dashed-line{flex:1;border-top:2px dashed var(--border);margin:0 0.5rem;}
  .ticket-body{padding:1rem 1.25rem 1.25rem;display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:start;}
  .ticket-fields{display:flex;flex-direction:column;gap:0.7rem;}
  .ticket-field{display:flex;flex-direction:column;gap:0.1rem;}
  .field-label{font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-faint);}
  .field-value{font-size:0.875rem;font-weight:500;color:var(--text);}
  .field-value.accent{color:var(--accent-color,var(--accent));font-weight:700;}
  .status-badge{display:inline-flex;align-items:center;font-size:0.72rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;padding:0.15rem 0.55rem;border-radius:9999px;width:fit-content;}
  .status-paid,.status-confirmed{background:oklch(0.35 0.1 165/0.2);color:#4ade80;border:1px solid oklch(0.45 0.15 165/0.4);}
  .status-pending{background:oklch(0.35 0.1 60/0.2);color:#fbbf24;border:1px solid oklch(0.45 0.15 60/0.4);}
  .status-cancelled{background:oklch(0.35 0.1 15/0.2);color:#f87171;border:1px solid oklch(0.45 0.15 15/0.4);}
  .ticket-qr-section{display:flex;flex-direction:column;align-items:center;gap:0.35rem;}
  .qr-placeholder{width:90px;height:90px;border:2px solid;border-radius:var(--radius-md);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.3rem;background:var(--surface-2);}
  .qr-label{font-size:0.65rem;font-weight:700;letter-spacing:0.1em;color:var(--text-faint);}
  .ticket-code{font-size:0.82rem;font-weight:700;color:var(--text);letter-spacing:0.06em;font-variant-numeric:tabular-nums;}
  .ticket-code-note{font-size:0.65rem;color:var(--text-faint);}
  .ticket-actions{display:flex;flex-direction:column;gap:0.6rem;}
  .action-btn{display:flex;align-items:center;justify-content:center;gap:0.5rem;padding:0.85rem;border-radius:var(--radius-lg);font-family:var(--font);font-size:0.9rem;font-weight:600;text-decoration:none;transition:opacity var(--tr),transform var(--tr);border:none;cursor:pointer;}
  .action-btn.primary{color:#0e0e0f;}
  .action-btn.secondary{background:var(--surface);border:1px solid var(--border);color:var(--text);}
  .action-btn:hover{opacity:0.88;transform:translateY(-1px);}
  @keyframes spin{to{transform:rotate(360deg)}}
  .spinner{width:28px;height:28px;border:2px solid var(--surface-3);border-top-color:var(--accent);border-radius:9999px;animation:spin 0.7s linear infinite;margin:4rem auto;}
  .loading-state{display:flex;justify-content:center;padding:4rem 0;}
  .error-state{text-align:center;padding:4rem 0;color:var(--text-muted);}
  .back-link{display:inline-flex;align-items:center;color:var(--accent);font-size:0.875rem;font-weight:500;text-decoration:none;margin-top:0.75rem;}
`



;