'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { API_BASE_URL } from '@/lib/supabase/api';


interface TicketType {
  id: string;
  name: string;
  price: string; // viene como string decimal
  currency: string;
}

interface Event {
  id: string;
  title: string;
  description: string;
  venueName: string;
  venueCity: string;
  startsAt: string;
  endsAt: string;
  isPublished: boolean;
  organizer?: { id: string; fullName: string; email: string };
  ticketTypes?: TicketType[];
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PALETTE = [
  '#00c2b3',
  '#f5a623',
  '#e05c5c',
  '#7c3aed',
  '#2563eb',
  '#16a34a',
  '#db2777',
  '#ea580c',
];
function colorFor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = str.charCodeAt(i) + ((h << 5) - h);
  }
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(t: string) {
  return t
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export default function CheckoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');


  useEffect(() => {
  const supabase = createClient();
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) {
      router.replace(`/login?redirectTo=/checkout/${id}`);
    }
  });
}, [id, router]);


  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE_URL}/events/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setEvent(d);
          // Auto-seleccionar el primer tipo de boleto
          if (d.ticketTypes?.length > 0) {
            setSelectedTypeId(d.ticketTypes[0].id);
          }
        }
      })
      .catch(() => setError('No se pudo cargar el evento.'))
      .finally(() => setLoading(false));
  }, [id]);

  const color = event ? colorFor(event.title) : '#00c2b3';
  const abbr = event ? initials(event.title) : '';

  const ticketTypes = event?.ticketTypes ?? [];
  const selectedTicketType = ticketTypes.find((t) => t.id === selectedTypeId) ?? ticketTypes[0] ?? null;
  const ticketPrice = selectedTicketType ? Number(selectedTicketType.price) : 0;
  const ticketName = selectedTicketType?.name ?? 'Entrada general';
  const hasTicketTypes = ticketTypes.length > 0;
  const total = qty * ticketPrice;

  async function handleBuy() {
    if (!event) return;

    const ticketType = selectedTicketType;
    if (!ticketType) {
      setError('No hay tipo de boleto disponible para este evento.');
      return;
    }

    setBuying(true);
    setError('');

    try {
      const supabase = createClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error('No se pudo obtener la sesión');
      }

      if (!session?.access_token) {
        throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
      }

      const res = await fetch(`${API_BASE_URL}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          eventId: event.id,
          ticketTypeId: ticketType.id,
          quantity: qty,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Error ${res.status}`);
      }

      const ticket = await res.json();
      router.push(`/tickets/${ticket.id}?new=1`);
    } catch (e: any) {
      setError(e.message ?? 'Ocurrió un error al procesar la compra.');
    } finally {
      setBuying(false);
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="page-root">
        <nav className="top-nav">
          <div className="nav-inner">
            <Link href={`/events/${id}`} className="back-btn">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Regresar
            </Link>
            <span className="nav-title">Checkout</span>
          </div>
        </nav>

        <main className="checkout-layout">
          {loading ? (
            <div className="loading-state">
              <div className="spinner" aria-label="Cargando…" />
            </div>
          ) : !event ? (
            <div className="error-state">
              <p>No se encontró el evento.</p>
              <Link href="/discover" className="back-link">
                ← Regresar a Descubrir
              </Link>
            </div>
          ) : (
            <>
              {/* Resumen del evento */}
              <section className="event-summary" aria-label="Resumen del evento">
                <div
                  className="summary-banner"
                  style={{
                    background: `linear-gradient(135deg, ${color}20 0%, #0e0e0f 100%)`,
                  }}
                >
                  <div className="summary-avatar" style={{ background: color }}>
                    {abbr}
                  </div>
                </div>
                <div className="summary-body">
                  <h1 className="summary-title">{event.title}</h1>
                  <div className="summary-meta-row">
                    <span className="summary-meta">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      {fmtDate(event.startsAt)}, {fmtTime(event.startsAt)}
                    </span>
                    <span className="summary-meta">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {event.venueName}, {event.venueCity}
                    </span>
                  </div>
                </div>
              </section>

              {/* Selector de boletos o mensaje vacío */}
              {!hasTicketTypes ? (
                <section className="ticket-selector">
                  <p className="qty-hint">
                    Este evento todavía no tiene tipos de boleto configurados.
                  </p>
                </section>
              ) : (
                <>
                  <section
                    className="ticket-selector"
                    aria-label="Seleccionar boletos"
                  >
                    <h2 className="section-label">Selecciona tu boleto</h2>

                    {/* Cards de tipos de boleto */}
                    <div className="ticket-type-list">
                      {ticketTypes.map((tt) => {
                        const isSelected = tt.id === (selectedTypeId ?? ticketTypes[0]?.id);
                        return (
                          <button
                            key={tt.id}
                            className={`ticket-type-card${isSelected ? ' selected' : ''}`}
                            style={isSelected ? { borderColor: color, boxShadow: `0 0 0 1px ${color}40` } : {}}
                            onClick={() => setSelectedTypeId(tt.id)}
                            aria-pressed={isSelected}
                          >
                            <div className="ttc-left">
                              <span className="ttc-check" style={isSelected ? { background: color } : {}}>
                                {isSelected && (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0e0e0f" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </span>
                              <span className="ttc-name">{tt.name}</span>
                            </div>
                            <span className="ttc-price" style={isSelected ? { color } : {}}>
                              ${Number(tt.price).toLocaleString('es-MX')} {tt.currency}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Cantidad */}
                    <div className="ticket-row" style={{ marginTop: '1rem' }}>
                      <div className="ticket-info">
                        <span className="ticket-name">{ticketName}</span>
                        <span className="ticket-price">
                          ${ticketPrice.toLocaleString('es-MX')} MXN por boleto
                        </span>
                      </div>
                      <div
                        className="qty-control"
                        role="group"
                        aria-label="Cantidad de boletos"
                      >
                        <button
                          className="qty-btn"
                          onClick={() => setQty((q) => Math.max(1, q - 1))}
                          disabled={qty <= 1}
                          aria-label="Quitar boleto"
                        >
                          −
                        </button>
                        <span className="qty-value" aria-live="polite">
                          {qty}
                        </span>
                        <button
                          className="qty-btn"
                          onClick={() => setQty((q) => Math.min(10, q + 1))}
                          disabled={qty >= 10}
                          aria-label="Agregar boleto"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <p className="qty-hint">Máximo 10 boletos por compra</p>
                  </section>

                  {/* Resumen de pago */}
                  <section
                    className="order-summary"
                    aria-label="Resumen de orden"
                  >
                    <h2 className="section-label">Resumen de orden</h2>
                    <div className="order-lines">
                      <div className="order-line">
                        <span>
                          {ticketName} × {qty}
                        </span>
                        <span>
                          $
                          {(qty * ticketPrice).toLocaleString('es-MX')} MXN
                        </span>
                      </div>
                      <div className="order-line muted">
                        <span>Cargos por servicio</span>
                        <span>Incluidos</span>
                      </div>
                      <div className="order-divider" />
                      <div className="order-line total">
                        <span>Total</span>
                        <span style={{ color }}>
                          ${total.toLocaleString('es-MX')} MXN
                        </span>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {/* Error */}
              {error && (
                <div className="error-banner" role="alert">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </div>
              )}

              {/* CTA */}
              <button
                className="buy-btn"
                style={{ background: color }}
                onClick={handleBuy}
                disabled={buying || !hasTicketTypes}
                aria-busy={buying}
              >
                {buying ? (
                  <>
                    <div className="btn-spinner" />
                    <span>Procesando…</span>
                  </>
                ) : (
                  <>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>
                      Confirmar compra · $
                      {total.toLocaleString('es-MX')} MXN
                    </span>
                  </>
                )}
              </button>
              <p className="buy-note">
                Al confirmar aceptas los términos de uso. Sin reembolsos.
              </p>
            </>
          )}
        </main>
      </div>
    </>
  );
}

const CSS = `
  @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');
  :root {
    --bg:#0e0e0f; --surface:#141415; --surface-2:#1a1a1c; --surface-3:#212124;
    --border:oklch(1 0 0/0.08); --border-hover:oklch(1 0 0/0.16);
    --text:#e8e8e9; --text-muted:#8a8a8e; --text-faint:#4a4a50;
    --accent:#00c2b3; --accent-dim:oklch(0.6 0.12 185/0.15);
    --radius-sm:6px; --radius-md:10px; --radius-lg:14px; --radius-xl:18px;
    --tr:180ms cubic-bezier(0.16,1,0.3,1);
    --font:'Satoshi','Inter',system-ui,sans-serif;
  }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  .page-root{min-height:100vh;background:var(--bg);color:var(--text);font-family:var(--font);font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased;}

  .top-nav{border-bottom:1px solid var(--border);padding:0.85rem clamp(1rem,4vw,2.5rem);position:sticky;top:0;background:oklch(0.1 0 0/0.85);backdrop-filter:blur(12px);z-index:10;display:flex;align-items:center;}
  .nav-inner{max-width:600px;margin:0 auto;width:100%;display:flex;align-items:center;justify-content:space-between;}
  .back-btn{display:inline-flex;align-items:center;gap:0.4rem;color:var(--text-muted);font-size:0.875rem;font-weight:500;text-decoration:none;transition:color var(--tr);}
  .back-btn:hover{color:var(--text);}
  .nav-title{font-size:0.875rem;font-weight:600;color:var(--text-muted);}

  .checkout-layout{max-width:600px;margin:0 auto;padding:2rem clamp(1rem,4vw,1.5rem) 4rem;display:flex;flex-direction:column;gap:1.25rem;}

  /* Event summary */
  .event-summary{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);overflow:hidden;}
  .summary-banner{height:72px;position:relative;display:flex;align-items:flex-end;padding:0 1.25rem 0.875rem;}
  .summary-avatar{width:44px;height:44px;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:700;color:#0e0e0f;box-shadow:0 2px 8px oklch(0 0 0/0.4);}
  .summary-body{padding:0.875rem 1.25rem 1.1rem;}
  .summary-title{font-size:1rem;font-weight:700;color:var(--text);letter-spacing:-0.01em;margin-bottom:0.5rem;}
  .summary-meta-row{display:flex;flex-direction:column;gap:0.3rem;}
  .summary-meta{display:flex;align-items:center;gap:0.4rem;font-size:0.8rem;color:var(--text-muted);}
  .summary-meta svg{color:var(--text-faint);}

  /* Ticket selector */
  .ticket-selector{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);padding:1.25rem;}
  .section-label{font-size:0.72rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-faint);margin-bottom:0.9rem;}
  .ticket-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;}
  .ticket-info{display:flex;flex-direction:column;gap:0.15rem;}
  .ticket-name{font-size:0.9rem;font-weight:600;color:var(--text);}
  .ticket-price{font-size:0.82rem;color:var(--text-muted);}
  .qty-control{display:flex;align-items:center;gap:0.5rem;background:var(--surface-2);border:1px solid var(--border);border-radius:9999px;padding:0.2rem;}
  .qty-btn{width:32px;height:32px;border-radius:9999px;background:none;border:none;color:var(--text);font-size:1.1rem;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background var(--tr);line-height:1;}
  .qty-btn:hover:not(:disabled){background:var(--surface-3);}
  .qty-btn:disabled{color:var(--text-faint);cursor:not-allowed;}
  .qty-value{font-size:0.95rem;font-weight:700;color:var(--text);min-width:1.5rem;text-align:center;font-variant-numeric:tabular-nums;}
  .qty-hint{font-size:0.72rem;color:var(--text-faint);margin-top:0.6rem;}

  /* Order summary */
  .order-summary{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);padding:1.25rem;}
  .order-lines{display:flex;flex-direction:column;gap:0.6rem;}
  .order-line{display:flex;justify-content:space-between;align-items:center;font-size:0.875rem;color:var(--text);}
  .order-line.muted{color:var(--text-faint);font-size:0.8rem;}
  .order-line.total{font-weight:700;font-size:0.95rem;}
  .order-divider{height:1px;background:var(--border);margin:0.4rem 0;}

  /* Error */
  .error-banner{display:flex;align-items:center;gap:0.6rem;background:oklch(0.35 0.1 15/0.15);border:1px solid oklch(0.45 0.15 15/0.35);border-radius:var(--radius-lg);padding:0.75rem 1rem;font-size:0.875rem;color:#f87171;}

  /* CTA */
  .buy-btn{width:100%;padding:0.95rem;border:none;border-radius:var(--radius-lg);color:#0e0e0f;font-family:var(--font);font-size:0.95rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;transition:opacity var(--tr),transform var(--tr);}
  .buy-btn:hover:not(:disabled){opacity:0.88;transform:translateY(-1px);}
  .buy-btn:active:not(:disabled){transform:translateY(0);}
  .buy-btn:disabled{opacity:0.55;cursor:not-allowed;transform:none;}
  .buy-note{font-size:0.72rem;color:var(--text-faint);text-align:center;}

  /* Spinner */
  @keyframes spin{to{transform:rotate(360deg)}}
  .spinner{width:28px;height:28px;border:2px solid var(--surface-3);border-top-color:var(--accent);border-radius:9999px;animation:spin 0.7s linear infinite;margin:4rem auto;}
  .btn-spinner{width:16px;height:16px;border:2px solid oklch(0 0 0/0.3);border-top-color:#0e0e0f;border-radius:9999px;animation:spin 0.7s linear infinite;flex-shrink:0;}

  /* Ticket type cards */
  .ticket-type-list{display:flex;flex-direction:column;gap:0.5rem;}
  .ticket-type-card{width:100%;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.7rem 0.875rem;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;transition:border-color var(--tr),box-shadow var(--tr),background var(--tr);font-family:var(--font);text-align:left;}
  .ticket-type-card:hover{background:var(--surface-3);border-color:var(--border-hover);}
  .ticket-type-card.selected{background:var(--surface-2);}
  .ttc-left{display:flex;align-items:center;gap:0.6rem;}
  .ttc-check{width:18px;height:18px;border-radius:9999px;border:1.5px solid var(--border-hover);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background var(--tr),border-color var(--tr);}
  .ttc-name{font-size:0.875rem;font-weight:600;color:var(--text);}
  .ttc-price{font-size:0.82rem;font-weight:600;color:var(--text-muted);white-space:nowrap;transition:color var(--tr);}

  .loading-state{display:flex;justify-content:center;padding:4rem 0;}
  .error-state{text-align:center;padding:4rem 0;color:var(--text-muted);}
  .back-link{display:inline-flex;align-items:center;color:var(--accent);font-size:0.875rem;font-weight:500;text-decoration:none;margin-top:0.75rem;}
`;
