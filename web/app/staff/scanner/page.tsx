'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Scanner } from '@yudiel/react-qr-scanner';
import { createClient } from '@/lib/supabase/client';
import { API_BASE_URL } from '@/lib/supabase/api';


/* ─────────────────────────── Types ─────────────────────────── */
type Role = 'BUYER' | 'ORGANIZER' | 'STAFF' | 'ADMIN';

type MeResponse = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  mfaEnabled?: boolean;
  createdAt?: string;
};

type ScanApiResult =
  | 'VALID'
  | 'INVALID'
  | 'EXPIRED'
  | 'ALREADY_USED'
  | 'REVOKED'
  | 'REPLAY_DETECTED';

type ScanResponse = {
  ok: boolean;
  result: ScanApiResult;
  message: string;
  ticketId?: string;
  ticket?: {
    id: string;
    status: string;
    usedAt?: string | null;
    event?: {
      id: string;
      title: string;
      startsAt: string;
      endsAt: string;
      venueName: string;
      venueCity: string;
    };
    owner?: {
      id: string;
      fullName: string;
      email: string;
    };
  };
};

/* ─────────────────────────── Helpers ─────────────────────────── */
type Tone = { bg: string; border: string; text: string; label: string; icon: 'check' | 'warn' | 'x' | 'idle' };

function getResultTone(result?: ScanApiResult): Tone {
  switch (result) {
    case 'VALID':
      return { bg: 'rgba(34,197,94,.10)', border: 'rgba(34,197,94,.28)', text: '#86efac', label: 'Acceso permitido', icon: 'check' };
    case 'ALREADY_USED':
      return { bg: 'rgba(251,191,36,.08)', border: 'rgba(251,191,36,.26)', text: '#fcd34d', label: 'Boleto ya usado', icon: 'warn' };
    case 'REVOKED':
    case 'INVALID':
    case 'EXPIRED':
    case 'REPLAY_DETECTED':
      return { bg: 'rgba(239,68,68,.09)', border: 'rgba(239,68,68,.26)', text: '#fca5a5', label: 'Acceso rechazado', icon: 'x' };
    default:
      return { bg: 'rgba(255,255,255,.025)', border: 'rgba(255,255,255,.07)', text: '#9a9ab0', label: 'En espera', icon: 'idle' };
  }
}

function extractQrPayload(raw: string): { qrToken?: string; ticketId?: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.split('.').length === 3) return { qrToken: trimmed };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed?.ticketId && typeof parsed.ticketId === 'string') return { ticketId: parsed.ticketId };
  } catch {}
  const matchJsonLike = trimmed.match(/"ticketId"\s*:\s*"([^"]+)"/);
  if (matchJsonLike?.[1]) return { ticketId: matchJsonLike[1] };
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(trimmed)) return { ticketId: trimmed };
  return null;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/* ─────────────────────────── Result icon ─────────────────────── */
function ResultIcon({ icon, color }: { icon: Tone['icon']; color: string }) {
  if (icon === 'check') return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
  if (icon === 'warn') return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
  if (icon === 'x') return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V9z"/>
    </svg>
  );
}

/* ─────────────────────────── InfoRow ─────────────────────────── */
function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong style={mono ? { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: '13px' } : undefined}>
        {value}
      </strong>
    </div>
  );
}

/* ─────────────────────────── Main page ─────────────────────────── */
export default function StaffScannerPage() {
  const router = useRouter();

  const [bootLoading, setBootLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [me, setMe] = useState<MeResponse | null>(null);

  const [gate, setGate] = useState('Acceso principal');
  const [deviceId, setDeviceId] = useState('scanner-web-01');
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastRaw, setLastRaw] = useState('');
  const [response, setResponse] = useState<ScanResponse | null>(null);
  const [cameraPaused, setCameraPaused] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  const tone = useMemo(() => getResultTone(response?.result), [response]);
  const resultCardRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);

  /* ── Boot animation ── */
  useEffect(() => {
    if (bootLoading) return;
    import('gsap').then(({ gsap }) => {
      if (layoutRef.current) {
        gsap.fromTo(
          layoutRef.current.querySelectorAll('.anim'),
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, stagger: 0.08, duration: 0.6, ease: 'power3.out' }
        );
      }
    });
  }, [bootLoading]);

  /* ── Result animation ── */
  useEffect(() => {
    if (!response || !resultCardRef.current) return;
    import('gsap').then(({ gsap }) => {
      gsap.fromTo(
        resultCardRef.current,
        { scale: 0.96, opacity: 0.4 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.4)' }
      );
    });
  }, [response]);

  /* ── Auth guard ── */
  useEffect(() => {
    async function guardPage() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { router.replace('/login'); return; }
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) { router.replace('/login'); return; }
        const data = (await res.json()) as MeResponse;
        const allowed: Role[] = ['STAFF', 'ORGANIZER', 'ADMIN'];
        if (!allowed.includes(data.role)) {
          setAuthError('No tienes permisos para acceder al scanner.');
          setTimeout(() => router.replace('/dashboard'), 1200);
          return;
        }
        setMe(data);
      } catch {
        setAuthError('No se pudo validar tu acceso.');
        setTimeout(() => router.replace('/dashboard'), 1200);
      } finally {
        setBootLoading(false);
      }
    }
    guardPage();
  }, [router]);

  /* ── Validation ── */
  async function submitValidation(qrToken: string, raw?: string) {
    if (!qrToken || loading) return;
    setLoading(true);
    setLastRaw(raw ?? qrToken);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setResponse({ ok: false, result: 'INVALID', message: 'Tu sesión expiró. Inicia sesión de nuevo.' });
        return;
      }
      const requestNonce =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await fetch(`${API_BASE_URL}/scans/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ qrToken, gate, deviceId, requestNonce }),
      });
      const data = (await res.json().catch(() => null)) as ScanResponse | null;
      if (!res.ok || !data) {
        setResponse({ ok: false, result: 'INVALID', message: data?.message || 'No se pudo validar el boleto.' });
        return;
      }
      setResponse(data);
      setScanCount((c) => c + 1);
      setCameraPaused(true);
    } catch {
      setResponse({ ok: false, result: 'INVALID', message: 'Ocurrió un error al validar el boleto.' });
    } finally {
      setLoading(false);
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = extractQrPayload(manualCode);
    if (!payload) {
      setResponse({ ok: false, result: 'INVALID', message: 'No se pudo interpretar el contenido ingresado.' });
      return;
    }
    if (payload.qrToken) { submitValidation(payload.qrToken, manualCode); return; }
    if (payload.ticketId) { submitValidation(payload.ticketId, manualCode); return; }
    setResponse({ ok: false, result: 'INVALID', message: 'Contenido inválido.' });
  }

  function resetScan() {
    setResponse(null);
    setLastRaw('');
    setManualCode('');
    setCameraPaused(false);
  }

  /* ── Guard screens ── */
  if (bootLoading) return (
    <>
      <style>{CSS}</style>
      <div className="guard-screen">
        <div className="guard-card">
          <div className="spinner" />
          <p>Validando permisos…</p>
        </div>
      </div>
    </>
  );

  if (authError && !me) return (
    <>
      <style>{CSS}</style>
      <div className="guard-screen">
        <div className="guard-card">
          <div className="guard-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
          <h2>Acceso restringido</h2>
          <p>{authError}</p>
        </div>
      </div>
    </>
  );

  /* ── Main UI ── */
  return (
    <>
      <style>{CSS}</style>
      <div className="scanner-page">

        {/* Nav */}
        <nav className="top-nav">
          <div className="nav-inner">
            <Link href="/dashboard" className="back-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Dashboard
            </Link>
            <div className="nav-badge">
              <span className="dot" />
              {me?.role ?? 'STAFF'}
            </div>
          </div>
        </nav>

        <div ref={layoutRef} className="page-layout">

          {/* Page header */}
          <header className="page-header anim">
            <div>
              <h1 className="page-title">Check-in</h1>
              <p className="page-subtitle">
                {me?.fullName ? `Hola, ${me.fullName.split(' ')[0]}. ` : ''}
                Escanea un QR o valida manualmente.
              </p>
            </div>
            <div className="header-right">
              <div className="stat-chip anim">
                <span className="stat-num">{scanCount}</span>
                <span className="stat-label">escaneados</span>
              </div>
              <button type="button" className="ghost-btn anim" onClick={() => setCameraPaused((v) => !v)}>
                {cameraPaused
                  ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polygon points="5 3 19 12 5 21 5 3"/></svg>Reanudar</>
                  : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pausar</>
                }
              </button>
            </div>
          </header>

          {/* Main grid */}
          <div className="main-grid">

            {/* Left col */}
            <div className="left-col">

              {/* Camera */}
              <div className="card camera-card anim">
                <div className="card-header">
                  <span className="card-label">Cámara</span>
                  <span className={`status-pill ${cameraPaused ? 'status-paused' : 'status-live'}`}>
                    {cameraPaused ? 'Pausada' : '● Activa'}
                  </span>
                </div>
                <div className="camera-viewport">
                  {cameraPaused ? (
                    <div className="camera-idle">
                      <div className="idle-icon">
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                        </svg>
                      </div>
                      <p>Cámara en pausa</p>
                      <button type="button" className="primary-btn" onClick={() => setCameraPaused(false)}>
                        Reanudar escaneo
                      </button>
                    </div>
                  ) : (
                    <Scanner
                      constraints={{ facingMode: 'environment' }}
                      onScan={(detectedCodes) => {
                        const raw = detectedCodes?.[0]?.rawValue;
                        if (!raw || loading) return;
                        const payload = extractQrPayload(raw);
                        if (!payload) {
                          setResponse({ ok: false, result: 'INVALID', message: 'El QR no contiene un payload válido.' });
                          setLastRaw(raw); setCameraPaused(true); return;
                        }
                        if (payload.qrToken) { submitValidation(payload.qrToken, raw); return; }
                        if (payload.ticketId) { submitValidation(payload.ticketId, raw); return; }
                        setResponse({ ok: false, result: 'INVALID', message: 'No se pudo interpretar el QR.' });
                        setLastRaw(raw); setCameraPaused(true);
                      }}
                      onError={() => setResponse({ ok: false, result: 'INVALID', message: 'No se pudo acceder a la cámara.' })}
                    />
                  )}
                  {loading && (
                    <div className="scan-overlay">
                      <div className="spinner" />
                    </div>
                  )}
                </div>
                <p className="camera-hint">Usa preferentemente la cámara trasera o una webcam enfocada al QR.</p>
              </div>

              {/* Config + Manual */}
              <div className="bottom-row">
                <div className="card config-card anim">
                  <div className="card-header">
                    <span className="card-label">Configuración</span>
                  </div>
                  <div className="fields">
                    <label className="field">
                      <span>Gate</span>
                      <input value={gate} onChange={(e) => setGate(e.target.value)} placeholder="Ej. Acceso A" />
                    </label>
                    <label className="field">
                      <span>Device ID</span>
                      <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="scanner-web-01" />
                    </label>
                  </div>
                </div>

                <div className="card manual-card anim">
                  <div className="card-header">
                    <span className="card-label">Validación manual</span>
                  </div>
                  <p className="manual-hint">Pega el token JWT, JSON o UUID del boleto.</p>
                  <form onSubmit={handleManualSubmit}>
                    <textarea
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder='{"ticketId":"f0d3d97f-…"}'
                    />
                    <button type="submit" className="primary-btn full-width" disabled={loading}>
                      {loading ? 'Validando…' : 'Validar boleto'}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Right col — Result */}
            <aside className="right-col">
              <div
                ref={resultCardRef}
                className="result-card anim"
                style={{ borderColor: tone.border, background: `linear-gradient(160deg, ${tone.bg} 0%, rgba(10,10,15,0) 55%)` }}
              >
                <div className="result-status" style={{ borderBottomColor: tone.border }}>
                  <div className="result-icon-wrap" style={{ background: tone.bg, border: `1px solid ${tone.border}` }}>
                    <ResultIcon icon={tone.icon} color={tone.text} />
                  </div>
                  <div>
                    <p className="result-label" style={{ color: tone.text }}>{tone.label}</p>
                    <p className="result-message">{response?.message ?? 'Esperando el próximo escaneo'}</p>
                  </div>
                </div>

                {response?.ticket ? (
                  <div className="result-body">
                    <p className="section-title">Boleto</p>
                    <div className="info-grid">
                      <InfoRow label="Código" value={`#${response.ticket.id.slice(0, 8).toUpperCase()}`} mono />
                      <InfoRow label="Estado" value={response.ticket.status} />
                      {response.ticket.usedAt && <InfoRow label="Usado en" value={fmtDateTime(response.ticket.usedAt)} />}
                    </div>

                    {response.ticket.owner && (
                      <>
                        <p className="section-title">Titular</p>
                        <div className="owner-card">
                          <div className="owner-avatar">
                            {response.ticket.owner.fullName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                          </div>
                          <div>
                            <p className="owner-name">{response.ticket.owner.fullName}</p>
                            <p className="owner-email">{response.ticket.owner.email}</p>
                          </div>
                        </div>
                      </>
                    )}

                    {response.ticket.event && (
                      <>
                        <p className="section-title">Evento</p>
                        <div className="info-grid">
                          <InfoRow label="Nombre" value={response.ticket.event.title} />
                          <InfoRow label="Recinto" value={response.ticket.event.venueName} />
                          <InfoRow label="Ciudad" value={response.ticket.event.venueCity} />
                          <InfoRow label="Inicio" value={fmtDateTime(response.ticket.event.startsAt)} />
                        </div>
                      </>
                    )}
                  </div>
                ) : response ? (
                  <div className="result-body">
                    {lastRaw && (
                      <div className="raw-box">
                        <span>Contenido leído</span>
                        <code>{lastRaw}</code>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="result-idle">
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="1.3">
                      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V9z"/>
                      <path d="M13 5v2M13 17v2M13 11v2"/>
                    </svg>
                    <p>El resultado aparecerá aquí al escanear un boleto.</p>
                  </div>
                )}

                {response && (
                  <div className="result-footer">
                    <button type="button" className="next-scan-btn" onClick={resetScan}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-3.82"/>
                      </svg>
                      Escanear siguiente
                    </button>
                  </div>
                )}
              </div>
            </aside>

          </div>
        </div>
      </div>
    </>
  );
}

const CSS = `
:root {
  --bg: #050507;
  --panel: #0e0e12;
  --border: #1e1e28;
  --border-subtle: rgba(255,255,255,.05);
  --text: #f0f0f2;
  --muted: #8888a0;
  --soft: #5a5a6a;
  --accent: #7c3aed;
  --accent-2: #9333ea;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: var(--bg);
  color: var(--text);
  font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { text-decoration: none; color: inherit; }
button, input, textarea { font: inherit; }

.guard-screen {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: radial-gradient(ellipse 70% 40% at 50% 0%, rgba(124,58,237,.13), transparent), #050507;
}
.guard-card {
  width: min(92vw, 400px);
  padding: 32px;
  border-radius: 24px;
  text-align: center;
  background: var(--panel);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.guard-card h2 { font-size: 26px; letter-spacing: -.03em; }
.guard-card p { color: var(--muted); font-size: 15px; }
.guard-icon {
  width: 52px; height: 52px; border-radius: 16px;
  display: grid; place-items: center;
  border: 1px solid rgba(239,68,68,.2);
  background: rgba(239,68,68,.08);
  margin-bottom: 4px;
}
.spinner {
  width: 38px; height: 38px; border-radius: 999px;
  border: 3px solid rgba(255,255,255,.06);
  border-top-color: var(--accent);
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.scanner-page {
  min-height: 100vh;
  background: radial-gradient(ellipse 80% 35% at 50% -5%, rgba(124,58,237,.11), transparent), #050507;
}
.top-nav {
  position: sticky; top: 0; z-index: 20;
  backdrop-filter: blur(20px);
  background: rgba(5,5,7,.75);
  border-bottom: 1px solid var(--border-subtle);
}
.nav-inner {
  max-width: 1200px; margin: 0 auto;
  padding: 16px 24px;
  display: flex; align-items: center; justify-content: space-between;
}
.back-btn {
  display: inline-flex; align-items: center; gap: 7px;
  color: var(--muted); font-size: 14px; transition: color .2s;
}
.back-btn:hover { color: var(--text); }
.nav-badge {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 12px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: #c4c4d0;
}
.dot {
  width: 7px; height: 7px; border-radius: 999px;
  background: #22c55e; box-shadow: 0 0 6px #22c55e;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }

.page-layout { max-width: 1200px; margin: 0 auto; padding: 36px 24px 80px; }

.page-header {
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 16px; margin-bottom: 32px; opacity: 0;
}
.page-title { font-size: 44px; font-weight: 800; letter-spacing: -.05em; line-height: 1; }
.page-subtitle { margin-top: 8px; color: var(--muted); font-size: 15px; }
.header-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(300px, .7fr);
  gap: 20px;
  align-items: start;
}
.left-col { display: flex; flex-direction: column; gap: 16px; }

.card {
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--panel);
  overflow: hidden;
  opacity: 0;
}
.card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.card-label {
  font-size: 12px; font-weight: 700; color: var(--muted);
  text-transform: uppercase; letter-spacing: .07em;
}

.camera-viewport {
  position: relative; background: #080810;
  min-height: 380px; display: flex; align-items: center; justify-content: center;
}
.camera-viewport > div { width: 100%; }
.camera-idle {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 14px;
  min-height: 380px; color: var(--muted); text-align: center;
}
.idle-icon {
  width: 60px; height: 60px; border-radius: 18px;
  display: grid; place-items: center;
  background: rgba(255,255,255,.04); border: 1px solid var(--border);
  color: var(--soft); margin-bottom: 4px;
}
.scan-overlay {
  position: absolute; inset: 0;
  background: rgba(5,5,7,.7);
  display: grid; place-items: center;
  backdrop-filter: blur(4px);
}
.camera-hint {
  padding: 12px 20px; font-size: 12px; color: var(--soft);
  border-top: 1px solid var(--border-subtle);
}

.status-pill {
  display: inline-flex; align-items: center; padding: 4px 12px;
  border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .06em;
}
.status-live  { color: #86efac; background: rgba(34,197,94,.1);  border: 1px solid rgba(34,197,94,.2); }
.status-paused { color: #fcd34d; background: rgba(251,191,36,.1); border: 1px solid rgba(251,191,36,.2); }

.bottom-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.fields { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 7px; }
.field span {
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
}
.field input {
  border: 1px solid var(--border); border-radius: 12px;
  background: rgba(255,255,255,.03); color: var(--text);
  padding: 10px 14px; font-size: 14px; outline: none; transition: border-color .2s;
}
.field input:focus { border-color: rgba(124,58,237,.5); }

.manual-card { display: flex; flex-direction: column; }
.manual-card form { padding: 0 20px 20px; display: flex; flex-direction: column; gap: 12px; }
.manual-hint { padding: 10px 20px 0; font-size: 13px; color: var(--muted); }
.manual-card textarea {
  min-height: 100px; resize: vertical;
  border: 1px solid var(--border); border-radius: 12px;
  background: rgba(255,255,255,.03); color: var(--text);
  padding: 12px 14px; font-size: 12px; outline: none;
  transition: border-color .2s;
  font-family: 'JetBrains Mono', monospace;
}
.manual-card textarea:focus { border-color: rgba(124,58,237,.5); }

.ghost-btn {
  display: inline-flex; align-items: center; gap: 7px;
  min-height: 38px; padding: 0 16px;
  border-radius: 12px; border: 1px solid var(--border);
  background: rgba(255,255,255,.04); color: var(--text);
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background .2s, border-color .2s;
}
.ghost-btn:hover { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.12); }
.primary-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 42px; padding: 0 20px;
  border-radius: 12px; border: none;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff; font-size: 14px; font-weight: 700; cursor: pointer;
  transition: filter .2s, opacity .2s;
}
.primary-btn:hover:not(:disabled) { filter: brightness(1.08); }
.primary-btn:disabled { opacity: .55; cursor: not-allowed; }
.full-width { width: 100%; }

.stat-chip {
  display: flex; flex-direction: column; align-items: center;
  padding: 8px 16px; border-radius: 12px;
  background: rgba(255,255,255,.04); border: 1px solid var(--border);
  opacity: 0;
}
.stat-num { font-size: 20px; font-weight: 800; line-height: 1; letter-spacing: -.03em; }
.stat-label { font-size: 10px; color: var(--soft); margin-top: 2px; text-transform: uppercase; letter-spacing: .05em; }

.right-col { position: sticky; top: 88px; }
.result-card {
  border: 1px solid; border-radius: 20px; overflow: hidden;
  display: flex; flex-direction: column; opacity: 0;
}
.result-status {
  display: flex; align-items: center; gap: 16px;
  padding: 20px; border-bottom: 1px solid;
}
.result-icon-wrap {
  width: 52px; height: 52px; border-radius: 16px;
  display: grid; place-items: center; flex-shrink: 0;
}
.result-label {
  font-size: 11px; font-weight: 800;
  letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px;
}
.result-message { font-size: 15px; font-weight: 600; color: var(--text); line-height: 1.35; }
.result-body { padding: 16px 20px 4px; display: flex; flex-direction: column; gap: 14px; }
.section-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .08em; color: var(--soft);
}
.info-grid { display: flex; flex-direction: column; gap: 10px; }
.info-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; font-size: 14px; }
.info-row span { color: var(--muted); flex-shrink: 0; }
.info-row strong { color: var(--text); font-weight: 600; text-align: right; }

.owner-card {
  display: flex; align-items: center; gap: 14px;
  padding: 14px; border-radius: 14px;
  background: rgba(255,255,255,.03); border: 1px solid var(--border-subtle);
}
.owner-avatar {
  width: 42px; height: 42px; border-radius: 12px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  display: grid; place-items: center;
  font-size: 14px; font-weight: 800; color: #fff; flex-shrink: 0;
}
.owner-name { font-size: 15px; font-weight: 700; }
.owner-email { font-size: 13px; color: var(--muted); margin-top: 2px; }

.raw-box {
  padding: 14px; border-radius: 14px;
  background: rgba(0,0,0,.2); border: 1px solid rgba(255,255,255,.05);
}
.raw-box span {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--soft);
}
.raw-box code {
  display: block; margin-top: 8px; font-size: 12px;
  font-family: 'JetBrains Mono', monospace; color: #d8b4fe;
  white-space: pre-wrap; word-break: break-all;
}
.result-idle {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; padding: 40px 20px;
  text-align: center; color: var(--soft); font-size: 14px;
}
.result-footer { padding: 16px 20px 20px; border-top: 1px solid var(--border-subtle); }
.next-scan-btn {
  width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; border-radius: 12px;
  border: 1px solid var(--border); background: rgba(255,255,255,.04);
  color: var(--text); font-size: 14px; font-weight: 600; cursor: pointer;
  transition: background .2s;
}
.next-scan-btn:hover { background: rgba(255,255,255,.07); }

@media (max-width: 1024px) {
  .main-grid { grid-template-columns: 1fr; }
  .right-col { position: static; }
}
@media (max-width: 640px) {
  .page-layout { padding: 24px 16px 64px; }
  .page-title { font-size: 36px; }
  .bottom-row { grid-template-columns: 1fr; }
  .page-header { flex-direction: column; align-items: flex-start; }
  .camera-viewport, .camera-idle { min-height: 300px; }
}
`;
