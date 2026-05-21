'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/supabase/api';


/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Event {
  id: string;
  title: string;
  description: string;
  venueName: string;
  venueCity: string;
  startsAt: string;
  endsAt: string;
  isPublished: boolean;
  bannerUrl?: string;   // ← nuevo campo (opcional, fallback a patrón SVG)
  category?: string;    // ← nuevo campo opcional: 'music'|'theater'|'sport'|'festival'|'other'
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/* ─── Color palette & avatar ─────────────────────────────────────────── */
const PALETTE = [
  '#00c2b3','#f5a623','#e05c5c','#7c3aed',
  '#2563eb','#16a34a','#db2777','#ea580c',
];
function colorFor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(t: string) {
  return t.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/* ─── Generative SVG banner fallback ─────────────────────────────────── */
function generateSVGPattern(title: string, color: string): string {
  let seed = 0;
  for (let i = 0; i < title.length; i++) seed = title.charCodeAt(i) + ((seed << 5) - seed);
  const rand = (n: number) => Math.abs((seed = seed * 1664525 + 1013904223) % n);

  const shapes: string[] = [];
  const c2 = color + '55';
  const c3 = color + '22';

  // Background circles
  for (let i = 0; i < 5; i++) {
    const cx = rand(700), cy = rand(220), r = 40 + rand(80);
    shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${i % 2 === 0 ? c2 : c3}"/>`);
  }
  // Diagonal lines
  for (let i = 0; i < 6; i++) {
    const x = rand(700), y = rand(220);
    shapes.push(`<line x1="${x}" y1="${y}" x2="${x + 60 + rand(80)}" y2="${y + 60 + rand(60)}" stroke="${color}33" stroke-width="1.5"/>`);
  }
  // Small accent circles
  for (let i = 0; i < 4; i++) {
    const cx = rand(700), cy = rand(220);
    shapes.push(`<circle cx="${cx}" cy="${cy}" r="${4 + rand(8)}" fill="${color}88"/>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 220" preserveAspectRatio="xMidYMid slice">
    <rect width="700" height="220" fill="#0e0e0f"/>
    ${shapes.join('\n    ')}
    <rect width="700" height="220" fill="url(#grad)"/>
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0e0e0f" stop-opacity="0"/>
        <stop offset="100%" stop-color="#0e0e0f" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
  </svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/* ─── Category icon ──────────────────────────────────────────────────── */
function CategoryIcon({ category }: { category?: string }) {
  const icons: Record<string, string> = {
    music:    'M9 18V5l12-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm12-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    theater:  'M2 10s3-3 10-3 10 3 10 3v10H2V10zM12 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    sport:    'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM4.9 7.4 9 11.5M19.1 7.4l-4.1 4.1M12 2v5M12 17v5M2 12h5M17 12h5',
    festival: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    other:    'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  };
  const d = icons[category ?? 'other'] ?? icons.other;
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d}/>
    </svg>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="skel-card">
      <div className="skel-banner skeleton" />
      <div className="skel-body">
        <div className="skeleton skel-title" />
        <div className="skeleton skel-meta" />
        <div className="skeleton skel-meta short" />
      </div>
    </div>
  );
}

/* ─── Event Card ─────────────────────────────────────────────────────── */
function EventCard({ event, index }: { event: Event; index: number }) {
  const color  = colorFor(event.title);
  const abbr   = initials(event.title);
  const banner = event.bannerUrl ?? generateSVGPattern(event.title, color);
  const days   = daysUntil(event.startsAt);

  const urgencyLabel = days === 0
    ? '¡Hoy!'
    : days === 1
    ? 'Mañana'
    : days > 0 && days <= 7
    ? `En ${days} días`
    : null;

  return (
    <Link
      href={`/events/${event.id}`}
      className="event-card"
      data-card-index={index}
      style={{ '--accent-color': color, '--card-index': index } as React.CSSProperties}
    >
      {/* Banner */}
      <div className="card-banner">
        <img
          src={banner}
          alt=""
          className="card-banner-img"
          loading="lazy"
          draggable={false}
        />
        <div className="card-banner-overlay" style={{ background: `linear-gradient(to bottom, ${color}18 0%, #0e0e0f 100%)` }} />

        <div className="card-banner-row">
          <div className="card-avatar" style={{ background: color }}>{abbr}</div>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {urgencyLabel && (
              <div className="card-urgency-badge" style={{ borderColor: `${color}55`, color }}>
                {urgencyLabel}
              </div>
            )}
            <div className="card-city-badge">{event.venueCity}</div>
          </div>
        </div>
      </div>

      {/* Glow ring on hover */}
      <div className="card-glow" style={{ background: `radial-gradient(circle at 50% 0%, ${color}30 0%, transparent 70%)` }} />

      {/* Body */}
      <div className="card-body">
        <div className="card-category">
          <CategoryIcon category={event.category} />
          <span>{event.category ?? 'Evento'}</span>
        </div>

        <h2 className="card-title">{event.title}</h2>
        <p className="card-desc">{event.description}</p>

        <div className="card-meta-row">
          <span className="card-meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {fmtDate(event.startsAt)}
          </span>
          <span className="card-meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
            </svg>
            {fmtTime(event.startsAt)}
          </span>
        </div>

        <div className="card-venue">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          {event.venueName}
        </div>

        <div className="card-footer">
          <span className="card-cta" style={{ color }}>
            Ver evento
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ─── Empty State ────────────────────────────────────────────────────── */
function EmptyState({ query }: { query: string }) {
  return (
    <div className="empty-state">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="empty-icon" aria-hidden="true">
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M16 28s2-4 8-4 8 4 8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="18" cy="20" r="2" fill="currentColor"/>
        <circle cx="30" cy="20" r="2" fill="currentColor"/>
      </svg>
      {query
        ? <><h3>Sin resultados para "{query}"</h3><p>Intenta con otra ciudad o palabra clave.</p></>
        : <><h3>No hay eventos disponibles</h3><p>Vuelve pronto, nuevos eventos se publican seguido.</p></>
      }
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */
export default function DiscoverPage() {
  const [events, setEvents]   = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [city, setCity]       = useState('');

  const heroRef     = useRef<HTMLElement>(null);
  const eyebrowRef  = useRef<HTMLDivElement>(null);
  const titleRef    = useRef<HTMLHeadingElement>(null);
  const subRef      = useRef<HTMLParagraphElement>(null);
  const searchRef   = useRef<HTMLDivElement>(null);
  const gridRef     = useRef<HTMLDivElement>(null);
  const cardsRef    = useRef<HTMLDivElement>(null);
  const gsapLoaded  = useRef(false);

  /* ── Fetch events ── */
  useEffect(() => {
    fetch(`${API_BASE_URL}/events`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setEvents(data))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  /* ── Load GSAP & animate hero ── */
  useEffect(() => {
    if (gsapLoaded.current) return;
    gsapLoaded.current = true;

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
    script.onload = () => {
      const ScrollTriggerScript = document.createElement('script');
      ScrollTriggerScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js';
      ScrollTriggerScript.onload = () => initGSAP();
      document.head.appendChild(ScrollTriggerScript);
    };
    document.head.appendChild(script);
  }, []);

  function initGSAP() {
    const { gsap } = window as any;
    const { ScrollTrigger } = window as any;
    gsap.registerPlugin(ScrollTrigger);

    // Hero timeline
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from(eyebrowRef.current,  { opacity: 0, y: 20, duration: 0.6 })
      .from(titleRef.current,    { opacity: 0, y: 40, duration: 0.7 }, '-=0.3')
      .from(subRef.current,      { opacity: 0, y: 20, duration: 0.5 }, '-=0.4')
      .from(searchRef.current,   { opacity: 0, y: 20, duration: 0.5 }, '-=0.35');

    // Parallax on hero grid
    if (gridRef.current && heroRef.current) {
      gsap.to(gridRef.current, {
        yPercent: 35,
        ease: 'none',
        scrollTrigger: {
          trigger: heroRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });
    }
  }

  /* ── Animate cards when they appear ── */
  useEffect(() => {
    if (loading || !cardsRef.current) return;
    const { gsap } = window as any;
    if (!gsap) return;

    const cards = cardsRef.current.querySelectorAll('.event-card');
    gsap.from(cards, {
      opacity: 0,
      y: 40,
      scale: 0.96,
      duration: 0.55,
      stagger: 0.08,
      ease: 'power3.out',
      clearProps: 'all',
    });
  }, [loading, search, city]);

  /* ── Magnetic hover on cards (GSAP) ── */
  useEffect(() => {
    const { gsap } = window as any;
    if (!gsap || !cardsRef.current) return;

    const cards = Array.from(cardsRef.current.querySelectorAll('.event-card')) as HTMLElement[];
    const cleanups: (() => void)[] = [];

    cards.forEach(card => {
      const onMove = (e: MouseEvent) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top  - rect.height / 2;
        gsap.to(card, { x: x * 0.04, y: y * 0.04, duration: 0.4, ease: 'power2.out' });
      };
      const onLeave = () => {
        gsap.to(card, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
      };
      card.addEventListener('mousemove', onMove);
      card.addEventListener('mouseleave', onLeave);
      cleanups.push(() => {
        card.removeEventListener('mousemove', onMove);
        card.removeEventListener('mouseleave', onLeave);
      });
    });

    return () => cleanups.forEach(fn => fn());
  }, [loading, search, city]);

  const cities = useMemo(() => {
    const set = new Set(events.map(e => e.venueCity));
    return Array.from(set).sort();
  }, [events]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return events.filter(e => {
      const matchText = !q || e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
      const matchCity = !city || e.venueCity === city;
      return matchText && matchCity;
    });
  }, [events, search, city]);

  const hasFilters = search || city;

  return (
    <>
      <style>{CSS}</style>
      <div className="page-root">

        {/* ── Hero ── */}
        <header className="hero" ref={heroRef}>
          <div className="hero-inner">
            <div className="hero-eyebrow" ref={eyebrowRef}>
              <span className="hero-eyebrow-dot" />
              Eventos en vivo
            </div>
            <h1 className="hero-title" ref={titleRef}>
              Descubre tu próxima<br />
              <span className="hero-title-accent">experiencia</span>
            </h1>
            <p className="hero-sub" ref={subRef}>
              Conciertos, festivales, teatro y más — todo en un solo lugar.
            </p>

            {/* Search bar */}
            <div className="search-bar" ref={searchRef}>
              <div className="search-input-wrap">
                <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="search"
                  className="search-input"
                  placeholder="Buscar eventos…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  aria-label="Buscar eventos"
                />
              </div>
              <select
                className="city-select"
                value={city}
                onChange={e => setCity(e.target.value)}
                aria-label="Filtrar por ciudad"
              >
                <option value="">Todas las ciudades</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {hasFilters && (
                <button className="clear-btn" onClick={() => { setSearch(''); setCity(''); }} aria-label="Limpiar filtros">
                  ✕ Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Decorative elements */}
          <div className="hero-grid" ref={gridRef} aria-hidden="true" />
          <div className="hero-glow-left"  aria-hidden="true" />
          <div className="hero-glow-right" aria-hidden="true" />
        </header>

        {/* ── Stats bar ── */}
        {!loading && events.length > 0 && (
          <div className="stats-bar">
            <div className="stats-inner">
              <span className="stat">
                <strong>{filtered.length}</strong>
                {hasFilters ? ' resultado' + (filtered.length !== 1 ? 's' : '') : ' evento' + (events.length !== 1 ? 's' : '')}
              </span>
              {hasFilters && events.length !== filtered.length && (
                <span className="stat muted">de {events.length} totales</span>
              )}
            </div>
          </div>
        )}

        {/* ── Content ── */}
        <main className="page-main">
          {loading ? (
            <div className="events-grid">
              {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState query={search} />
          ) : (
            <div className="events-grid" ref={cardsRef}>
              {filtered.map((event, i) => (
                <EventCard key={event.id} event={event} index={i} />
              ))}
            </div>
          )}
        </main>

      </div>
    </>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700,800,900&display=swap');

  :root {
    --bg:            #0e0e0f;
    --surface:       #141415;
    --surface-2:     #1a1a1c;
    --surface-3:     #212124;
    --border:        oklch(1 0 0 / 0.08);
    --border-hover:  oklch(1 0 0 / 0.16);
    --text:          #e8e8e9;
    --text-muted:    #8a8a8e;
    --text-faint:    #4a4a50;
    --accent:        #00c2b3;
    --accent-hover:  #00a89b;
    --accent-dim:    oklch(0.6 0.12 185 / 0.15);
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
    --radius-xl: 20px;
    --transition: 200ms cubic-bezier(0.16, 1, 0.3, 1);
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

  /* ── Hero ── */
  .hero {
    position: relative;
    overflow: hidden;
    padding: clamp(4rem, 9vw, 7rem) clamp(1rem, 4vw, 2.5rem) clamp(3rem, 6vw, 5rem);
    border-bottom: 1px solid var(--border);
  }
  .hero-inner {
    position: relative;
    z-index: 3;
    max-width: 960px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0;
  }

  /* Eyebrow */
  .hero-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 1.25rem;
    padding: 0.3rem 0.9rem;
    border: 1px solid oklch(0.6 0.12 185 / 0.35);
    border-radius: 9999px;
    background: var(--accent-dim);
  }
  .hero-eyebrow-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse-dot 2s ease-in-out infinite;
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(0.7); }
  }

  /* Title */
  .hero-title {
    font-size: clamp(2.2rem, 5.5vw, 4rem);
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1.05;
    color: var(--text);
    margin-bottom: 1rem;
  }
  .hero-title-accent {
    background: linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .hero-sub {
    font-size: clamp(0.95rem, 2vw, 1.1rem);
    color: var(--text-muted);
    max-width: 48ch;
    margin-bottom: 2.5rem;
  }

  /* Hero decorations */
  .hero-grid {
    position: absolute;
    inset: 0;
    z-index: 1;
    background-image:
      linear-gradient(oklch(1 0 0 / 0.03) 1px, transparent 1px),
      linear-gradient(90deg, oklch(1 0 0 / 0.03) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: radial-gradient(ellipse 80% 70% at 50% 0%, black 0%, transparent 100%);
    will-change: transform;
  }
  .hero-glow-left {
    position: absolute;
    top: -20%;
    left: -10%;
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, oklch(0.6 0.12 185 / 0.12) 0%, transparent 70%);
    z-index: 2;
    pointer-events: none;
  }
  .hero-glow-right {
    position: absolute;
    top: -10%;
    right: -10%;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, oklch(0.5 0.2 295 / 0.10) 0%, transparent 70%);
    z-index: 2;
    pointer-events: none;
  }

  /* ── Search bar ── */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    max-width: 680px;
    flex-wrap: wrap;
  }
  @media (max-width: 600px) {
    .search-bar { flex-direction: column; align-items: stretch; }
  }
  .search-input-wrap {
    position: relative;
    flex: 1;
    min-width: 180px;
  }
  .search-icon {
    position: absolute;
    left: 0.875rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-faint);
    pointer-events: none;
  }
  .search-input {
    width: 100%;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--text);
    font-family: var(--font);
    font-size: 0.9rem;
    padding: 0.75rem 1rem 0.75rem 2.6rem;
    outline: none;
    transition: border-color var(--transition), box-shadow var(--transition);
    appearance: none;
  }
  .search-input::placeholder { color: var(--text-faint); }
  .search-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }
  .search-input::-webkit-search-cancel-button { display: none; }

  .city-select {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--text);
    font-family: var(--font);
    font-size: 0.875rem;
    padding: 0.75rem 2.25rem 0.75rem 1rem;
    outline: none;
    cursor: pointer;
    transition: border-color var(--transition), box-shadow var(--transition);
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8a8e' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
  }
  .city-select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }
  .city-select option { background: #1a1a1c; color: var(--text); }

  .clear-btn {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--text-muted);
    font-family: var(--font);
    font-size: 0.82rem;
    font-weight: 500;
    padding: 0.75rem 1rem;
    cursor: pointer;
    white-space: nowrap;
    transition: color var(--transition), border-color var(--transition), background var(--transition);
  }
  .clear-btn:hover { color: var(--text); border-color: var(--border-hover); background: var(--surface-2); }

  /* ── Stats bar ── */
  .stats-bar {
    border-bottom: 1px solid var(--border);
    padding: 0.6rem clamp(1rem, 4vw, 2.5rem);
  }
  .stats-inner {
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.82rem;
  }
  .stat { color: var(--text-muted); }
  .stat strong { color: var(--text); font-weight: 600; }
  .stat.muted { color: var(--text-faint); }

  /* ── Main ── */
  .page-main {
    max-width: 1100px;
    margin: 0 auto;
    padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2.5rem);
  }

  /* ── Events grid ── */
  .events-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(310px, 100%), 1fr));
    gap: 1.25rem;
  }

  /* ── Event card ── */
  .event-card {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition:
      border-color var(--transition),
      box-shadow var(--transition);
    will-change: transform;
    isolation: isolate;
  }
  .event-card:hover {
    border-color: var(--accent-color, var(--accent));
    box-shadow:
      0 8px 32px oklch(0 0 0 / 0.35),
      0 0 0 1px var(--accent-color, var(--accent)) inset;
  }
  .event-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  /* Glow layer */
  .card-glow {
    position: absolute;
    inset: 0;
    z-index: 0;
    opacity: 0;
    transition: opacity 0.4s ease;
    pointer-events: none;
    border-radius: var(--radius-xl);
  }
  .event-card:hover .card-glow { opacity: 1; }

  /* Banner */
  .card-banner {
    position: relative;
    height: 160px;
    overflow: hidden;
  }
  .card-banner-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .event-card:hover .card-banner-img {
    transform: scale(1.05);
  }
  .card-banner-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
  }
  .card-banner-row {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 2;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: 0.75rem 1rem;
  }
  .card-avatar {
    width: 46px;
    height: 46px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    font-weight: 800;
    color: #0e0e0f;
    letter-spacing: 0.01em;
    flex-shrink: 0;
    box-shadow: 0 2px 12px oklch(0 0 0 / 0.5);
  }
  .card-city-badge {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    background: oklch(0 0 0 / 0.55);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 0.22rem 0.6rem;
    border-radius: 9999px;
    border: 1px solid var(--border);
  }
  .card-urgency-badge {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    background: oklch(0 0 0 / 0.55);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 0.22rem 0.6rem;
    border-radius: 9999px;
    border: 1px solid;
  }

  /* Body */
  .card-body {
    position: relative;
    z-index: 1;
    padding: 1rem 1.15rem 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex: 1;
  }
  .card-category {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin-bottom: 0.1rem;
  }
  .card-title {
    font-size: 1rem;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .card-desc {
    font-size: 0.82rem;
    color: var(--text-muted);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-meta-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.25rem;
  }
  .card-meta-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .card-meta-item svg { color: var(--text-faint); flex-shrink: 0; }
  .card-venue {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.78rem;
    color: var(--text-faint);
  }
  .card-venue svg { flex-shrink: 0; }
  .card-footer {
    margin-top: auto;
    padding-top: 0.75rem;
    display: flex;
    justify-content: flex-end;
  }
  .card-cta {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    transition: gap var(--transition);
  }
  .event-card:hover .card-cta { gap: 0.55rem; }

  /* ── Skeleton ── */
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
  .skeleton {
    background: linear-gradient(90deg,
      var(--surface-2) 25%,
      var(--surface-3) 50%,
      var(--surface-2) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.6s ease-in-out infinite;
    border-radius: var(--radius-sm);
  }
  .skel-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }
  .skel-banner { height: 160px; border-radius: 0; }
  .skel-body   { padding: 1rem 1.15rem 1.15rem; display: flex; flex-direction: column; gap: 0.6rem; }
  .skel-title  { height: 16px; width: 70%; }
  .skel-meta   { height: 13px; width: 55%; }
  .skel-meta.short { width: 40%; }

  /* ── Empty state ── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 5rem 2rem;
    gap: 0.75rem;
    color: var(--text-muted);
    grid-column: 1 / -1;
  }
  .empty-icon { color: var(--text-faint); margin-bottom: 0.5rem; }
  .empty-state h3 { font-size: 1rem; font-weight: 600; color: var(--text); }
  .empty-state p  { font-size: 0.875rem; max-width: 34ch; }
`;
