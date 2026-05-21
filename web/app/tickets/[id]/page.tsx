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
const TICKET_PRICE = 250;

// ─── Confetti ────────────────────────────────────────────────────────────────
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

// ─── Tiburón animado (vista aérea) ───────────────────────────────────────────
//
// El tiburón nada en una trayectoria elíptica sobre el QR usando canvas 2D.
// Se dibuja visto desde arriba: cuerpo fusiforme, aleta dorsal prominente,
// cola en horquilla, aletas pectorales y un ojo lateral.
// La animación es continua y fluida — imposible capturar en foto estática.
//
function SharkOverlay({ color, size = 160 }: { color: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = size;
    const H = size;
    canvas.width  = W;
    canvas.height = H;

    // Órbita elíptica centrada en el QR
    const cx = W / 2;
    const cy = H / 2;
    const rx = W * 0.34;   // radio horizontal de la órbita
    const ry = H * 0.26;   // radio vertical
    const speed = 0.018;   // rad / frame  (~60 fps → ~6 s por vuelta)

    // Extrae componentes RGB del color del evento para matiz propio
    let sharkColor = color;

    let angle = 0;

    // ── Dibuja el cuerpo del tiburón centrado en (0,0) apuntando hacia +X
    function drawShark(ctx: CanvasRenderingContext2D, bodyLen: number) {
      const L = bodyLen;
      const W2 = L * 0.22;  // semi-ancho máximo del cuerpo

      ctx.save();

      // Sombra suave en el agua
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur  = 6;

      // ── Cuerpo principal (fusiforme) ──────────────────────────────────────
      ctx.beginPath();
      // Parte delantera (hocico puntiagudo)
      ctx.moveTo(L * 0.52, 0);
      // Lado superior
      ctx.bezierCurveTo(
        L * 0.30,  -W2 * 0.6,
        -L * 0.10, -W2,
        -L * 0.30, -W2 * 0.5
      );
      // Cola — lóbulo superior
      ctx.bezierCurveTo(
        -L * 0.40, -W2 * 0.2,
        -L * 0.45,  W2 * 0.05,
        -L * 0.52,  0
      );
      // Cola — lóbulo inferior
      ctx.bezierCurveTo(
        -L * 0.45, -W2 * 0.05,
        -L * 0.40,  W2 * 0.2,
        -L * 0.30,  W2 * 0.5
      );
      // Lado inferior
      ctx.bezierCurveTo(
        -L * 0.10,  W2,
        L * 0.30,   W2 * 0.6,
        L * 0.52,   0
      );
      ctx.closePath();

      // Degradado dorsal (más oscuro en el lomo)
      const grad = ctx.createLinearGradient(0, -W2, 0, W2);
      grad.addColorStop(0,   sharkColor);
      grad.addColorStop(0.5, sharkColor + 'cc');
      grad.addColorStop(1,   sharkColor + '88');
      ctx.fillStyle = grad;
      ctx.fill();

      // ── Aleta dorsal ───────────────────────────────────────────────────────
      ctx.beginPath();
      ctx.moveTo(L * 0.05, -W2 * 0.82);
      ctx.bezierCurveTo(
        L * 0.10, -W2 * 1.55,
        L * 0.18, -W2 * 1.60,
        L * 0.22, -W2 * 1.45
      );
      ctx.bezierCurveTo(
        L * 0.24, -W2 * 1.20,
        L * 0.18, -W2 * 0.95,
        L * 0.14, -W2 * 0.85
      );
      ctx.closePath();
      ctx.fillStyle = sharkColor;
      ctx.shadowBlur = 3;
      ctx.fill();

      // ── Cola (horquilla) ──────────────────────────────────────────────────
      // Lóbulo superior
      ctx.beginPath();
      ctx.moveTo(-L * 0.50, -W2 * 0.08);
      ctx.bezierCurveTo(
        -L * 0.58, -W2 * 0.60,
        -L * 0.70, -W2 * 0.90,
        -L * 0.78, -W2 * 0.75
      );
      ctx.bezierCurveTo(
        -L * 0.72, -W2 * 0.50,
        -L * 0.58, -W2 * 0.18,
        -L * 0.50,  W2 * 0.08
      );
      ctx.closePath();
      ctx.fillStyle = sharkColor + 'dd';
      ctx.fill();

      // Lóbulo inferior
      ctx.beginPath();
      ctx.moveTo(-L * 0.50,  W2 * 0.08);
      ctx.bezierCurveTo(
        -L * 0.56,  W2 * 0.45,
        -L * 0.66,  W2 * 0.68,
        -L * 0.72,  W2 * 0.55
      );
      ctx.bezierCurveTo(
        -L * 0.65,  W2 * 0.35,
        -L * 0.56,  W2 * 0.15,
        -L * 0.50, -W2 * 0.08
      );
      ctx.closePath();
      ctx.fillStyle = sharkColor + 'bb';
      ctx.fill();

      // ── Aletas pectorales ─────────────────────────────────────────────────
      // Superior
      ctx.beginPath();
      ctx.moveTo(L * 0.18, -W2 * 0.88);
      ctx.bezierCurveTo(
        L * 0.22, -W2 * 1.30,
        L * 0.05, -W2 * 1.40,
        -L * 0.05,-W2 * 1.15
      );
      ctx.bezierCurveTo(
        -L * 0.02,-W2 * 0.98,
        L * 0.08, -W2 * 0.92,
        L * 0.18, -W2 * 0.88
      );
      ctx.closePath();
      ctx.fillStyle = sharkColor + 'aa';
      ctx.fill();

      // Inferior
      ctx.beginPath();
      ctx.moveTo(L * 0.18,  W2 * 0.88);
      ctx.bezierCurveTo(
        L * 0.22,  W2 * 1.30,
        L * 0.05,  W2 * 1.40,
        -L * 0.05, W2 * 1.15
      );
      ctx.bezierCurveTo(
        -L * 0.02, W2 * 0.98,
        L * 0.08,  W2 * 0.92,
        L * 0.18,  W2 * 0.88
      );
      ctx.closePath();
      ctx.fillStyle = sharkColor + 'aa';
      ctx.fill();

      // ── Ojo ───────────────────────────────────────────────────────────────
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(L * 0.28, -W2 * 0.42, L * 0.035, L * 0.025, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fill();
      // Brillo
      ctx.beginPath();
      ctx.ellipse(L * 0.285, -W2 * 0.44, L * 0.010, L * 0.008, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();

      // ── Boca ──────────────────────────────────────────────────────────────
      ctx.beginPath();
      ctx.moveTo(L * 0.50,  W2 * 0.08);
      ctx.quadraticCurveTo(L * 0.44,  W2 * 0.22, L * 0.36,  W2 * 0.10);
      ctx.strokeStyle = 'rgba(0,0,0,0.50)';
      ctx.lineWidth   = 1.2;
      ctx.stroke();

      ctx.restore();
    }

    // ── Bucle principal ──────────────────────────────────────────────────────
    function tick() {
      ctx.clearRect(0, 0, W, H);

      angle += speed;
      if (angle > Math.PI * 2) angle -= Math.PI * 2;

      // Posición en la órbita elíptica
      const px = cx + rx * Math.cos(angle);
      const py = cy + ry * Math.sin(angle);

      // Orientación tangente a la elipse
      const tx = -rx * Math.sin(angle);
      const ty =  ry * Math.cos(angle);
      const heading = Math.atan2(ty, tx);

      // Escala según perspectiva (ligeramente mayor en la parte inferior)
      const depthScale = 0.82 + 0.18 * ((Math.sin(angle) + 1) / 2);
      const bodyLen = W * 0.48 * depthScale;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(heading);

      // Estela de agua (ondas concéntricas semitransparentes)
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(
          -bodyLen * (0.15 + i * 0.18), 0,
          bodyLen * 0.12 * i,
          bodyLen * 0.06 * i,
          0, 0, Math.PI * 2
        );
        ctx.strokeStyle = `rgba(255,255,255,${0.12 - i * 0.03})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      drawShark(ctx, bodyLen);
      ctx.restore();

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [color, size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        borderRadius: '10px',
      }}
    />
  );
}

// ─── QR con Tiburón ──────────────────────────────────────────────────────────
function QRWithShark({
  value,
  color,
  size = 160,
}: {
  value: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '10px',
        overflow: 'hidden',
        // Leve backdrop para que el tiburón destaque
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      {/* QR estático debajo */}
      <QRCode
        value={value}
        size={size}
        bgColor="transparent"
        fgColor={color}
        style={{ display: 'block' }}
      />

      {/* Tiburón encima */}
      <SharkOverlay color={color} size={size} />
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
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

  const color    = ticket?.event ? colorFor(ticket.event.title) : '#00c2b3';
  const abbr     = ticket?.event ? initials(ticket.event.title) : '';
  const total    = (ticket?.quantity ?? 0) * TICKET_PRICE;
  const shortId  = ticket?.id.slice(0, 8).toUpperCase() ?? '';

  const normalizedStatus = (ticket?.status ?? 'PENDING').toUpperCase();
  const isUsed    = normalizedStatus === 'USED';
  const isBlocked = ['USED', 'REVOKED', 'EXPIRED'].includes(normalizedStatus);

  async function loadQrToken(ticketId: string) {
    try {
      setQrLoading(true);
      setQrError('');

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setQrError('Tu sesión expiró. Inicia sesión nuevamente.');
        return;
      }

      const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}/qr-token`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data) throw new Error(data?.message || 'No se pudo generar el QR dinámico.');

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
    if (isBlocked) { setQrToken(''); setQrExpiresAt(''); return; }

    let intervalId: NodeJS.Timeout;
    loadQrToken(ticket.id);
    intervalId = setInterval(() => loadQrToken(ticket.id), 25000);
    return () => clearInterval(intervalId);
  }, [ticket?.id, isBlocked]);

  useEffect(() => {
    async function loadTicket() {
      if (!id) return;
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { setNF(true); return; }

        const res = await fetch(`${API_BASE_URL}/tickets/${id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.status === 404) { setNF(true); return; }
        if (!res.ok) throw new Error('No se pudo cargar el boleto');

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
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Mis boletos
            </Link>
          </div>
        </nav>

        <main className="ticket-layout">
          {loading ? (
            <div className="loading-state"><div className="spinner" /></div>
          ) : notFound || !ticket ? (
            <div className="error-state">
              <p>No se encontró el boleto.</p>
              <Link href="/tickets/me" className="back-link">← Ver mis boletos</Link>
            </div>
          ) : (
            <>
              {isNew && (
                <div className="success-banner" role="status">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  ¡Compra exitosa! Tu boleto está listo.
                </div>
              )}

              {/* ── Boleto visual ── */}
              <div className="ticket-card" style={{ '--accent-color': color } as React.CSSProperties}>

                {/* Header */}
                <div className="ticket-header" style={{ background: `linear-gradient(135deg, ${color}28 0%, #1a1a1c 100%)` }}>
                  <div className="ticket-avatar" style={{ background: color }}>{abbr}</div>
                  <div className="ticket-event-info">
                    <h1 className="ticket-event-title">{ticket.event?.title ?? '—'}</h1>
                    {ticket.event && (
                      <p className="ticket-event-meta">
                        {fmtDate(ticket.event.startsAt)}, {fmtTime(ticket.event.startsAt)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Perforación */}
                <div className="ticket-perforation" aria-hidden="true">
                  <div className="notch left" />
                  <div className="dashed-line" />
                  <div className="notch right" />
                </div>

                {/* Cuerpo */}
                <div className="ticket-body">
                  <div className="ticket-fields">
                    <div className="ticket-field">
                      <span className="field-label">Titular</span>
                      <span className="field-value">{ticket.buyer?.fullName ?? '—'}</span>
                    </div>
                    <div className="ticket-field">
                      <span className="field-label">Recinto</span>
                      <span className="field-value">{ticket.event?.venueName ?? '—'}</span>
                    </div>
                    <div className="ticket-field">
                      <span className="field-label">Ciudad</span>
                      <span className="field-value">{ticket.event?.venueCity ?? '—'}</span>
                    </div>
                    <div className="ticket-field">
                      <span className="field-label">Cantidad</span>
                      <span className="field-value">{ticket.quantity} boleto{ticket.quantity !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="ticket-field">
                      <span className="field-label">Total pagado</span>
                      <span className="field-value accent">${total.toLocaleString('es-MX')} MXN</span>
                    </div>
                    <div className="ticket-field">
                      <span className="field-label">Estado</span>
                      <span className={`status-badge status-${(ticket.status ?? 'pending').toLowerCase()}`}>
                        {ticket.status ?? 'PENDING'}
                      </span>
                    </div>
                  </div>

                  {/* ── Sección QR ── */}
                  <div className="ticket-qr-section">
                    {isBlocked ? (
                      <div className={`qr-blocked qr-${normalizedStatus.toLowerCase()}`}>
                        <div className="qr-blocked-icon">
                          {isUsed ? (
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M9 12l2 2 4-4"/>
                              <circle cx="12" cy="12" r="9"/>
                            </svg>
                          ) : (
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <circle cx="12" cy="12" r="9"/>
                              <path d="M8.5 8.5l7 7"/>
                              <path d="M15.5 8.5l-7 7"/>
                            </svg>
                          )}
                        </div>
                        <p className="ticket-code">#{shortId}</p>
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
                            <circle cx="12" cy="12" r="9"/>
                            <path d="M8.5 8.5l7 7"/>
                            <path d="M15.5 8.5l-7 7"/>
                          </svg>
                        </div>
                        <p className="qr-blocked-title">No se pudo generar el QR</p>
                        <p className="ticket-code-note">{qrError}</p>
                      </div>
                    ) : (
                      <>
                        {/* ✦ QR + Tiburón ✦ */}
                        <div className="qr-real">
                          <QRWithShark
                            value={qrToken}
                            color={color}
                            size={140}
                          />
                        </div>

                        <p className="ticket-code">#{shortId}</p>
                        <p className="ticket-code-note">Este código se actualiza automáticamente.</p>
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

              {/* ── Acciones ── */}
              <div className="ticket-actions">
                <Link href="/discover" className="action-btn secondary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  Descubrir más eventos
                </Link>
                <Link href="/tickets/me" className="action-btn primary" style={{ background: color }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/>
                    <polyline points="14,2 20,2 20,8"/>
                    <line x1="10" y1="14" x2="20" y2="4"/>
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
  .qr-real{position:relative;border-radius:10px;overflow:hidden;}
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
`;
