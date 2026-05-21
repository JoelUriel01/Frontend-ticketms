'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/supabase/api';


/* ─── Types ────────────────────────────────────────────────── */
interface Organizer { id: string; fullName: string; email: string; }
interface Event {
  id: string; title: string; description: string;
  venueName: string; venueCity: string;
  startsAt: string; endsAt: string;
  isPublished: boolean; organizer?: Organizer;
}

/* ─── Helpers ───────────────────────────────────────────────── */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
function durationHrs(start: string, end: string) {
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
  if (diff < 24) return `${diff % 1 === 0 ? diff : diff.toFixed(1)} h`;
  return `${Math.round(diff / 24)} días`;
}

const PALETTE = ['#00c2b3','#f5a623','#e05c5c','#7c3aed','#2563eb','#16a34a','#db2777','#ea580c'];
function colorFor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(t: string) { return t.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(); }

/* ─── Countdown hook ─────────────────────────────────────────── */
function useCountdown(target: string) {
  // calc se define fuera del estado para que el intervalo
  // siempre lea el target actual y no un closure stale
  const calcRef = useRef<(() => {
  d: number;
  h: number;
  m: number;
  s: number;
  over: boolean;
 }) | null>(null);
  calcRef.current = () => {
    const diff = new Date(target).getTime() - Date.now();
    if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0, over: true };
    const d = Math.floor(diff / 86_400_000);
    const h = Math.floor((diff % 86_400_000) / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1_000);
    return { d, h, m, s, over: false };
  };

  const [tick, setTick] = useState(() => calcRef.current!());
  useEffect(() => {
    // reset inmediato cuando cambia el target
    setTick(calcRef.current!());
    const id = setInterval(() => setTick(calcRef.current!()), 1_000);
    return () => clearInterval(id);
  }, [target]);
  return tick;
}

/* ─── Skeleton ───────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div className="skel-root">
      <div className="skel-hero skeleton" />
      <div className="skel-body">
        <div className="skel-left">
          <div className="skeleton" style={{ width: '65%', height: 36, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: '40%', height: 16, borderRadius: 6, marginTop: 12 }} />
          <div className="skeleton" style={{ width: '100%', height: 14, borderRadius: 6, marginTop: 32 }} />
          <div className="skeleton" style={{ width: '80%', height: 14, borderRadius: 6, marginTop: 8 }} />
        </div>
        <div className="skel-right">
          <div className="skeleton" style={{ width: '100%', height: 320, borderRadius: 14 }} />
        </div>
      </div>
    </div>
  );
}

/* ─── Not Found ──────────────────────────────────────────────── */
function NotFound() {
  return (
    <div className="nf-wrap">
      <svg width="52" height="52" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16 28s2-4 8-4 8 4 8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="18" cy="20" r="2" fill="currentColor" /><circle cx="30" cy="20" r="2" fill="currentColor" />
      </svg>
      <h2>Evento no encontrado</h2>
      <p>El evento que buscas no existe o ya no está disponible.</p>
      <Link href="/discover" className="back-link">← Regresar a Descubrir</Link>
    </div>
  );
}

/* ─── Flip digit ─────────────────────────────────────────────── */
function Digit({ value, label }: { value: number; label: string }) {
  return (
    <div className="digit-block">
      <span className="digit-num">{String(value).padStart(2, '0')}</span>
      <span className="digit-label">{label}</span>
    </div>
  );
}

/* ─── Info row ───────────────────────────────────────────────── */
function InfoRow({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="info-row">
      <span className="info-icon" style={{ color: accent || 'var(--text-faint)' }} aria-hidden="true">{icon}</span>
      <div className="info-text">
        <span className="info-label">{label}</span>
        <span className="info-value">{value}</span>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────── */
export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNF] = useState(false);

  /* refs for GSAP targets */
  const heroRef    = useRef<HTMLDivElement>(null);
  const avatarRef  = useRef<HTMLDivElement>(null);
  const titleRef   = useRef<HTMLHeadingElement>(null);
  const bylineRef  = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const orbs       = useRef<HTMLDivElement[]>([]);

  /* data */
  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE_URL}/events/${id}`)
      .then(r => { if (r.status === 404) { setNF(true); return null; } return r.ok ? r.json() : null; })
      .then(d => { if (d) setEvent(d); })
      .catch(() => setNF(true))
      .finally(() => setLoading(false));
  }, [id]);

  /* GSAP entrance — runs once event is rendered */
  const gsapRef = useRef<any>(null); // guarda la instancia para el cleanup
  useEffect(() => {
    if (!event) return;

    // bandera de cancelación: si el componente se desmonta antes de que
    // el import() resuelva, cancelamos antes de tocar el DOM
    let cancelled = false;

    (async () => {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');

      // si ya nos fuimos, no hacer nada
      if (cancelled) return;

      gsap.registerPlugin(ScrollTrigger);
      gsapRef.current = gsap; // guardamos para poder matar tweens en cleanup

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      /* floating orbs */
      orbs.current.forEach((orb, i) => {
        gsap.to(orb, {
          y: `${(i % 2 === 0 ? -1 : 1) * 28}px`,
          x: `${(i % 3 === 0 ? 1 : -1) * 18}px`,
          duration: 4 + i * 0.7,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: i * 0.4,
        });
      });

      /* staggered entrance */
      tl.from(heroRef.current,   { opacity: 0, duration: 0.7 })
        .from(avatarRef.current, { scale: 0.5, opacity: 0, duration: 0.55, ease: 'back.out(2)' }, '-=0.2')
        .from(titleRef.current,  { y: 28, opacity: 0, duration: 0.55 }, '-=0.35')
        .from(bylineRef.current, { y: 16, opacity: 0, duration: 0.4 }, '-=0.3')
        .from(sectionRef.current?.querySelectorAll('.animate-in') ?? [], {
          y: 20, opacity: 0, duration: 0.45, stagger: 0.1,
        }, '-=0.25')
        .from(sidebarRef.current, { x: 32, opacity: 0, duration: 0.55 }, '-=0.5');
    })();

    return () => {
      // 1. evita que la promesa actúe si aún no resolvió
      cancelled = true;
      // 2. mata todos los tweens activos si ya habían iniciado
      if (gsapRef.current) {
        gsapRef.current.killTweensOf('*');
        gsapRef.current = null;
      }
    };
  }, [event]);

  const color = event ? colorFor(event.title) : '#00c2b3';
  const abbr  = event ? initials(event.title) : '';
  const cd    = useCountdown(event?.startsAt ?? '');

  /* ── Icons ── */
  const IcoCalendar = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  const IcoClock    = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>;
  const IcoTimer    = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.73 4.27a10 10 0 1 0 2 2"/><polyline points="22,2 22,6 18,6"/></svg>;
  const IcoHouse    = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>;
  const IcoPin      = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
  const IcoTicket   = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 9a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4V9z"/></svg>;

  return (
    <>
      <style>{CSS}</style>
      <div className="page-root">

        {/* ── Nav ── */}
        <nav className="top-nav">
          <div className="nav-inner">
            <Link href="/discover" className="back-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
              Descubrir
            </Link>
            {event && (
              <span className="nav-badge" style={{ background: `${color}22`, color }}>
                {event.isPublished ? '● Publicado' : '○ Borrador'}
              </span>
            )}
          </div>
        </nav>

        {loading ? <Skeleton /> : notFound || !event ? <NotFound /> : (
          <article className="detail-layout">

            {/* ── Hero ── */}
            <div
              ref={heroRef}
              className="detail-hero"
              style={{ '--accent': color } as React.CSSProperties}
            >
              {/* ambient orbs */}
              {[0,1,2].map(i => (
                <div
                  key={i}
                  className="orb"
                  ref={el => { if (el) orbs.current[i] = el; }}
                  style={{
                    background: color,
                    width:  [220, 160, 130][i],
                    height: [220, 160, 130][i],
                    left:   ['8%', '55%', '80%'][i],
                    top:    ['-40%', '10%', '-60%'][i],
                    opacity: [0.18, 0.12, 0.09][i],
                  }}
                />
              ))}
              <div className="hero-grid" />
              <div className="hero-vignette" />

              <div className="hero-inner">
                <div ref={avatarRef} className="detail-avatar" style={{ background: color }}>
                  {abbr}
                </div>
              </div>
            </div>

            {/* ── Body ── */}
            <div className="detail-content" ref={sectionRef}>

              {/* Main column */}
              <div className="detail-main">
                <header className="detail-header animate-in">
                  <h1 ref={titleRef} className="detail-title">{event.title}</h1>
                  <div ref={bylineRef} className="detail-byline">
                    {event.organizer && (
                      <span className="byline-org">
                        Organizado por <strong>{event.organizer.fullName}</strong>
                      </span>
                    )}
                    <span className="byline-dot" aria-hidden="true" />
                    <span className="byline-city">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      {event.venueCity}
                    </span>
                  </div>
                </header>

                {/* Countdown */}
                {!cd.over && (
                  <div className="countdown-wrap animate-in">
                    <p className="countdown-eyebrow">El evento comienza en</p>
                    <div className="countdown-row">
                      <Digit value={cd.d} label="días" />
                      <span className="cd-sep">:</span>
                      <Digit value={cd.h} label="horas" />
                      <span className="cd-sep">:</span>
                      <Digit value={cd.m} label="min" />
                      <span className="cd-sep">:</span>
                      <Digit value={cd.s} label="seg" />
                    </div>
                    <div className="countdown-bar">
                      <div
                        className="countdown-bar-fill"
                        style={{
                          width: `${Math.min(100, 100 - (new Date(event.startsAt).getTime() - Date.now()) / 864_000)}%`,
                          background: color,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* About */}
                <section className="detail-section animate-in">
                  <h2 className="section-heading">Acerca de este evento</h2>
                  <p className="detail-desc">{event.description}</p>
                </section>

                {/* Date + Venue mini-pills */}
                <section className="detail-section animate-in">
                  <h2 className="section-heading">Cuándo &amp; Dónde</h2>
                  <div className="pill-grid">
                    <div className="info-pill">
                      <span className="pill-icon" style={{ color }}>{IcoCalendar}</span>
                      <div>
                        <p className="pill-label">Fecha</p>
                        <p className="pill-value">{fmtDate(event.startsAt)}</p>
                      </div>
                    </div>
                    <div className="info-pill">
                      <span className="pill-icon" style={{ color }}>{IcoClock}</span>
                      <div>
                        <p className="pill-label">Hora</p>
                        <p className="pill-value">{fmtTime(event.startsAt)} – {fmtTime(event.endsAt)}</p>
                      </div>
                    </div>
                    <div className="info-pill">
                      <span className="pill-icon" style={{ color }}>{IcoHouse}</span>
                      <div>
                        <p className="pill-label">Recinto</p>
                        <p className="pill-value">{event.venueName}</p>
                      </div>
                    </div>
                    <div className="info-pill">
                      <span className="pill-icon" style={{ color }}>{IcoPin}</span>
                      <div>
                        <p className="pill-label">Ciudad</p>
                        <p className="pill-value">{event.venueCity}</p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* ── Sidebar ── */}
              <aside ref={sidebarRef} className="detail-sidebar">

                {/* Ticket card */}
                <div className="ticket-card" style={{ '--accent': color } as React.CSSProperties}>
                  <div className="ticket-notch left" /><div className="ticket-notch right" />
                  <div className="ticket-top">
                    <span className="ticket-eyebrow">Entradas</span>
                    <span className="ticket-icon">{IcoTicket}</span>
                  </div>

                  <div className="ticket-rows">
                    <InfoRow icon={IcoCalendar} label="Fecha de inicio" value={`${fmtDate(event.startsAt)}, ${fmtTime(event.startsAt)}`} accent={color} />
                    <div className="ticket-divider" />
                    <InfoRow icon={IcoClock}    label="Fecha de cierre" value={`${fmtDate(event.endsAt)}, ${fmtTime(event.endsAt)}`} accent={color} />
                    <div className="ticket-divider" />
                    <InfoRow icon={IcoTimer}    label="Duración"        value={durationHrs(event.startsAt, event.endsAt)} accent={color} />
                    <div className="ticket-divider" />
                    <InfoRow icon={IcoHouse}    label="Recinto"         value={event.venueName} accent={color} />
                    <div className="ticket-divider" />
                    <InfoRow icon={IcoPin}      label="Ciudad"          value={event.venueCity} accent={color} />
                  </div>

                  <div className="ticket-tear" />

                  <button
                    className="cta-btn"
                    onClick={() => router.push(`/events/${event.id}/checkout`)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M2 9a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4V9z"/></svg>
                    Obtener entradas
                  </button>
                  <p className="cta-note">Reserva tu lugar — cupo limitado</p>
                </div>

                {/* Organizer card */}
                {event.organizer && (
                  <div className="org-card animate-in">
                    <h3 className="org-card-title">Organizador</h3>
                    <div className="org-row">
                      <div className="org-avatar" style={{ background: color }}>
                        {event.organizer.fullName.slice(0, 1)}
                      </div>
                      <div>
                        <p className="org-name">{event.organizer.fullName}</p>
                        <p className="org-email">{event.organizer.email}</p>
                      </div>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </article>
        )}
      </div>
    </>
  );
}


/* ─── Styles ─────────────────────────────────────────────────── */
const CSS = `
  @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');

  :root {
    --bg:         #0c0c0d;
    --surface:    #141416;
    --surface-2:  #1a1a1d;
    --surface-3:  #222226;
    --border:     oklch(1 0 0 / 0.07);
    --border-mid: oklch(1 0 0 / 0.12);
    --text:       #e9e9eb;
    --text-muted: #8a8a8e;
    --text-faint: #46464d;
    --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px; --radius-xl: 18px;
    --ease: cubic-bezier(0.16, 1, 0.3, 1);
    --font: 'Satoshi', 'Inter', system-ui, sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .page-root {
    min-height: 100vh; background: var(--bg); color: var(--text);
    font-family: var(--font); font-size: 15px; line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Nav ── */
  .top-nav {
    border-bottom: 1px solid var(--border);
    padding: 0.8rem clamp(1rem,4vw,2.5rem);
    position: sticky; top: 0;
    background: oklch(0.09 0 0 / 0.88);
    backdrop-filter: blur(14px);
    z-index: 20;
  }
  .nav-inner {
    max-width: 1100px; margin: 0 auto;
    display: flex; align-items: center; gap: 0.75rem;
  }
  .back-btn {
    display: inline-flex; align-items: center; gap: 0.35rem;
    color: var(--text-muted); font-size: 0.875rem; font-weight: 500;
    text-decoration: none; transition: color 180ms var(--ease);
  }
  .back-btn:hover { color: var(--text); }
  .nav-badge {
    font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em;
    padding: 0.2rem 0.6rem; border-radius: 999px;
  }

  /* ── Hero ── */
  .detail-hero {
    position: relative;
    height: clamp(180px, 24vw, 280px);
    overflow: hidden;
    display: flex; align-items: flex-end;
    background: radial-gradient(ellipse 70% 120% at 30% 50%, oklch(0.3 0.08 0 / 0.4), transparent 70%), var(--bg);
  }
  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(60px);
    pointer-events: none;
  }
  .hero-grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(oklch(1 0 0 / 0.025) 1px, transparent 1px),
      linear-gradient(90deg, oklch(1 0 0 / 0.025) 1px, transparent 1px);
    background-size: 40px 40px;
    mask-image: radial-gradient(ellipse 90% 120% at 50% 0%, black 30%, transparent 100%);
  }
  .hero-vignette {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, transparent 40%, var(--bg) 100%);
  }
  .hero-inner {
    position: relative; z-index: 3;
    padding: 0 clamp(1rem, 4vw, 2.5rem) 1.75rem;
    max-width: 1100px; width: 100%; margin: 0 auto;
  }
  .detail-avatar {
    width: 72px; height: 72px; border-radius: var(--radius-lg);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.35rem; font-weight: 700; color: #0c0c0d;
    box-shadow: 0 8px 32px oklch(0 0 0 / 0.5), 0 0 0 2px oklch(1 0 0 / 0.1);
    position: relative;
  }
  .detail-avatar::after {
    content: '';
    position: absolute; inset: -4px;
    border-radius: calc(var(--radius-lg) + 4px);
    background: linear-gradient(135deg, var(--accent, #00c2b3), transparent);
    opacity: 0.3; z-index: -1;
  }

  /* ── Layout ── */
  .detail-layout { max-width: 1100px; margin: 0 auto; }
  .detail-content {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 2.5rem;
    padding: 2.25rem clamp(1rem, 4vw, 2.5rem) 5rem;
    align-items: start;
  }
  @media (max-width: 768px) {
    .detail-content { grid-template-columns: 1fr; }
    .detail-sidebar { order: -1; }
  }

  /* ── Header ── */
  .detail-header { margin-bottom: 2rem; }
  .detail-title {
    font-size: clamp(1.75rem, 4.5vw, 2.5rem);
    font-weight: 700; letter-spacing: -0.04em; line-height: 1.1;
    color: var(--text);
  }
  .detail-byline {
    display: flex; align-items: center; flex-wrap: wrap; gap: 0.4rem;
    margin-top: 0.6rem; font-size: 0.875rem; color: var(--text-muted);
  }
  .byline-org strong { color: var(--text); font-weight: 600; }
  .byline-dot {
    width: 3px; height: 3px; border-radius: 50%;
    background: var(--text-faint); display: inline-block;
  }
  .byline-city { display: flex; align-items: center; gap: 0.25rem; }

  /* ── Countdown ── */
  .countdown-wrap {
    background: var(--surface);
    border: 1px solid var(--border-mid);
    border-radius: var(--radius-xl);
    padding: 1.25rem 1.5rem;
    margin-bottom: 2rem;
  }
  .countdown-eyebrow {
    font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--text-faint); margin-bottom: 0.75rem;
  }
  .countdown-row {
    display: flex; align-items: flex-end; gap: 0.3rem; margin-bottom: 1rem;
  }
  .digit-block { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; }
  .digit-num {
    font-size: 2rem; font-weight: 700; letter-spacing: -0.04em;
    color: var(--text); line-height: 1;
    font-variant-numeric: tabular-nums;
    min-width: 2.6ch; text-align: center;
  }
  .digit-label { font-size: 0.6rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-faint); }
  .cd-sep { font-size: 1.5rem; font-weight: 700; color: var(--text-faint); margin-bottom: 0.4rem; }
  .countdown-bar {
    height: 3px; background: var(--surface-3); border-radius: 99px; overflow: hidden;
  }
  .countdown-bar-fill { height: 100%; border-radius: 99px; transition: width 1s linear; }

  /* ── Sections ── */
  .detail-section { margin-bottom: 2rem; }
  .section-heading {
    font-size: 0.72rem; font-weight: 600; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--text-faint); margin-bottom: 1rem;
  }
  .detail-desc { font-size: 0.95rem; color: var(--text-muted); line-height: 1.8; max-width: 64ch; }

  /* ── Pills ── */
  .pill-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  @media (max-width: 520px) { .pill-grid { grid-template-columns: 1fr; } }
  .info-pill {
    display: flex; align-items: flex-start; gap: 0.65rem;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 0.9rem 1rem;
    transition: border-color 200ms var(--ease), background 200ms var(--ease);
  }
  .info-pill:hover { border-color: var(--border-mid); background: var(--surface-2); }
  .pill-icon { flex-shrink: 0; margin-top: 2px; }
  .pill-label { font-size: 0.68rem; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); }
  .pill-value { font-size: 0.875rem; font-weight: 600; color: var(--text); margin-top: 0.15rem; }

  /* ── Ticket card ── */
  .ticket-card {
    background: var(--surface);
    border: 1px solid var(--border-mid);
    border-radius: var(--radius-xl);
    position: relative; overflow: hidden;
    padding: 1.4rem;
  }
  .ticket-card::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(ellipse 60% 50% at 80% 0%, oklch(from var(--accent, #00c2b3) l c h / 0.12), transparent 60%);
    pointer-events: none;
  }
  .ticket-notch {
    position: absolute; top: 50%; transform: translateY(-50%);
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--bg);
    border: 1px solid var(--border-mid);
  }
  .ticket-notch.left  { left: -10px; }
  .ticket-notch.right { right: -10px; }

  .ticket-top {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 1.1rem;
  }
  .ticket-eyebrow {
    font-size: 0.72rem; font-weight: 600; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--text-faint);
  }
  .ticket-icon { color: var(--accent, #00c2b3); }

  .ticket-rows { display: flex; flex-direction: column; gap: 0.75rem; }
  .ticket-divider { height: 1px; background: var(--border); margin: 0 -1.4rem; }

  .ticket-tear {
    height: 1px;
    background: repeating-linear-gradient(90deg, var(--border-mid) 0 6px, transparent 6px 12px);
    margin: 1.25rem -1.4rem;
  }

  /* info-row inside ticket */
  .info-row { display: flex; align-items: flex-start; gap: 0.6rem; }
  .info-icon { flex-shrink: 0; margin-top: 2px; }
  .info-text { display: flex; flex-direction: column; gap: 0.1rem; }
  .info-label { font-size: 0.68rem; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); }
  .info-value { font-size: 0.875rem; color: var(--text); font-weight: 500; }

  /* ── CTA ── */
  .cta-btn {
    width: 100%; padding: 0.85rem 1rem;
    display: flex; align-items: center; justify-content: center; gap: 0.5rem;
    border: none; border-radius: var(--radius-lg);
    background: var(--accent, #00c2b3);
    color: #0c0c0d;
    font-family: var(--font); font-size: 0.9rem; font-weight: 700;
    cursor: pointer; letter-spacing: 0.01em;
    transition: opacity 160ms var(--ease), transform 160ms var(--ease), box-shadow 160ms var(--ease);
    box-shadow: 0 4px 20px oklch(from var(--accent, #00c2b3) l c h / 0.35);
  }
  .cta-btn:hover {
    opacity: 0.9; transform: translateY(-2px);
    box-shadow: 0 8px 28px oklch(from var(--accent, #00c2b3) l c h / 0.45);
  }
  .cta-btn:active { transform: translateY(0); }
  .cta-note { font-size: 0.7rem; color: var(--text-faint); text-align: center; margin-top: 0.6rem; }

  /* ── Organizer ── */
  .org-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-xl); padding: 1.1rem; margin-top: 0.75rem;
    transition: border-color 200ms var(--ease);
  }
  .org-card:hover { border-color: var(--border-mid); }
  .org-card-title { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 0.8rem; }
  .org-row { display: flex; align-items: center; gap: 0.75rem; }
  .org-avatar { width: 38px; height: 38px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 700; color: #0c0c0d; flex-shrink: 0; }
  .org-name  { font-size: 0.875rem; font-weight: 600; color: var(--text); }
  .org-email { font-size: 0.75rem; color: var(--text-faint); }

  /* ── Not found ── */
  .nf-wrap { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 6rem 2rem; gap: 0.75rem; color: var(--text-muted); }
  .nf-wrap h2 { font-size: 1.1rem; font-weight: 600; color: var(--text); }
  .nf-wrap p { font-size: 0.875rem; max-width: 34ch; }
  .back-link { color: #00c2b3; font-size: 0.875rem; font-weight: 500; text-decoration: none; margin-top: 0.5rem; }
  .back-link:hover { opacity: 0.8; }

  /* ── Skeleton ── */
  @keyframes shimmer { 0%{background-position:-200% 0}100%{background-position:200% 0} }
  .skeleton {
    background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 50%, var(--surface-2) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.6s ease-in-out infinite;
    border-radius: var(--radius-sm);
  }
  .skel-root {}
  .skel-hero { height: clamp(180px, 24vw, 280px); border-radius: 0; }
  .skel-body {
    max-width: 1100px; margin: 0 auto;
    padding: 2rem clamp(1rem, 4vw, 2.5rem);
    display: grid; grid-template-columns: 1fr 340px; gap: 2.5rem;
  }
  .skel-left { display: flex; flex-direction: column; gap: 0; }
  .skel-right {}
`;
