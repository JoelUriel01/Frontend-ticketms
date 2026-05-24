'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { API_BASE_URL } from '@/lib/supabase/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketType {
  id: string;
  name: string;
  price: string;
  currency: string;
}

interface SectionPrice {
  section: { code: string; label: string; colorHex: string };
  price: number;
  currency: string;
}

interface EventDetail {
  id: string;
  title: string;
  description: string;
  venueName: string;
  venueCity: string;
  startsAt: string;
  endsAt: string;
  isPublished: boolean;
  useVenueMap: boolean;
  organizer?: { id: string; fullName: string; email: string };
  ticketTypes?: TicketType[];
  eventSectionPrices?: SectionPrice[];
}

interface SeatData {
  id: string;           // e.g. "CTR-B-05"
  sectionCode: string;  // "CTR" | "IZQ" | "DER"
  sectionLabel: string;
  colorHex: string;
  row: string;
  number: number;
  seatLabel: string;
  x: number;
  y: number;
  price: number | null;
  currency: string;
  status: 'available' | 'sold' | 'held';
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

// ─── Seat Map Component ───────────────────────────────────────────────────────
// Renderiza el mapa SVG del auditorio ESCOM usando los datos reales del backend.
// Los asientos sold/held vienen del servidor; el usuario puede seleccionar
// los available. Emite `onSelectionChange` con los ids seleccionados.

const NS = 'http://www.w3.org/2000/svg';
const R = 9;
const GAP = 22;
const STARY = 126;
const CFG = {
  IZQ: { cx: 42,  max: 6  },
  CTR: { cx: 260, max: 11 },
  DER: { cx: 628, max: 6  },
} as const;
const ROWS = ['K','J','I','H','G','F','E','D','C','B','A'];

type SeatStatus = 'available' | 'sold' | 'held' | 'selected';

interface RenderSeat extends SeatData {
  renderStatus: SeatStatus;
}

function SeatMap({
  seats: rawSeats,
  onSelectionChange,
  accentColor,
}: {
  seats: SeatData[];
  onSelectionChange: (selected: RenderSeat[]) => void;
  accentColor: string;
}) {
  const svgRef   = useRef<SVGSVGElement>(null);
  const areaRef  = useRef<HTMLDivElement>(null);
  const tipRef   = useRef<HTMLDivElement>(null);

  // Local mutable state for seats (avoids full re-render on every click)
  const seatsRef   = useRef<RenderSeat[]>([]);
  const selectedRef = useRef<Set<string>>(new Set());
  const [renderTick, setRenderTick] = useState(0); // force sidebar re-render

  // Zoom / pan state
  const zoom = useRef(1);
  const pan  = useRef({ x: 0, y: 0 });
  const drag = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const pinchDist = useRef(0);

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    visible: boolean; label: string; sub: string; price: string; x: number; y: number;
  }>({ visible: false, label: '', sub: '', price: '', x: 0, y: 0 });

  // Capacity
  const [capacity, setCapacity] = useState({ CTR: 0, IZQ: 0, DER: 0 });

// Build RenderSeats from API data on mount/update
useEffect(() => {
  if (rawSeats.length === 0) return;
  seatsRef.current = rawSeats.map((s) => ({
    ...s,
    renderStatus: s.status === 'available' ? 'available' : s.status as SeatStatus,
  }));
  selectedRef.current.clear();
  recalcCapacity();
  setRenderTick((t) => t + 1); // dispara el segundo useEffect
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [rawSeats]);

// Dibujar cuando el SVG ya está montado Y los datos están listos
useEffect(() => {
  if (seatsRef.current.length === 0) return;
  // Pequeño defer para garantizar que el SVG está en el DOM
  const id = requestAnimationFrame(() => redrawAll());
  return () => cancelAnimationFrame(id);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [renderTick]);


  function recalcCapacity() {
    const totals = { CTR: 0, IZQ: 0, DER: 0 };
    const occupied = { CTR: 0, IZQ: 0, DER: 0 };
    seatsRef.current.forEach((s) => {
      const sec = s.sectionCode as 'CTR' | 'IZQ' | 'DER';
      totals[sec]++;
      if (s.renderStatus === 'sold' || s.renderStatus === 'selected') occupied[sec]++;
    });
    setCapacity({
      CTR: totals.CTR ? Math.round((occupied.CTR / totals.CTR) * 100) : 0,
      IZQ: totals.IZQ ? Math.round((occupied.IZQ / totals.IZQ) * 100) : 0,
      DER: totals.DER ? Math.round((occupied.DER / totals.DER) * 100) : 0,
    });
  }

  function getFill(s: RenderSeat) {
    if (s.renderStatus === 'selected') return 'var(--gold)';
    if (s.renderStatus === 'held')     return 'var(--warn)';
    if (s.renderStatus === 'sold')     return 'var(--faint)';
    // available: use section color
    return s.colorHex || 'var(--accent)';
  }
  function getOpacity(s: RenderSeat) { return s.renderStatus === 'sold' ? 0.38 : 0.92; }

function redrawAll() {
  // Usar querySelector porque getElementById en SVGElement no es confiable
  const g = svgRef.current?.querySelector('#seatsG') as SVGGElement | null;
  if (!g) return;
  g.innerHTML = '';
  const done = new Set<string>();

    seatsRef.current.forEach((s) => {
      const rk = s.sectionCode + s.row;
      if (!done.has(rk)) {
        done.add(rk);
        const lx = s.sectionCode === 'IZQ' ? CFG.IZQ.cx - GAP * 0.95
                 : s.sectionCode === 'DER' ? CFG.DER.cx + (CFG.DER.max - 1) * GAP + GAP * 0.95
                 : CFG.CTR.cx - GAP * 0.95;
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', String(lx));
        t.setAttribute('y', String(s.y));
        t.setAttribute('class', 'rlbl');
        t.textContent = s.row;
        g.appendChild(t);
      }
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', String(s.x));
      c.setAttribute('cy', String(s.y));
      c.setAttribute('r', String(R));
      c.setAttribute('fill', getFill(s));
      c.setAttribute('opacity', String(getOpacity(s)));
      c.setAttribute('class', 'seat ' + s.renderStatus);
      c.setAttribute('data-id', s.id);
      if (s.renderStatus === 'selected') c.setAttribute('filter', 'url(#glow)');
      g.appendChild(c);
    });
  }

  function refreshSeat(s: RenderSeat) {
    const el = svgRef.current?.querySelector(`[data-id="${s.id}"]`) as SVGCircleElement | null;
    if (!el) return;
    el.setAttribute('fill', getFill(s));
    el.setAttribute('opacity', String(getOpacity(s)));
    el.setAttribute('class', 'seat ' + s.renderStatus);
    if (s.renderStatus === 'selected') el.setAttribute('filter', 'url(#glow)');
    else el.removeAttribute('filter');
  }

  function applyTransform(smooth?: boolean) {
    const svg = svgRef.current;
    if (!svg) return;
    if (smooth) svg.style.transition = 'transform 300ms cubic-bezier(0.16,1,0.3,1)';
    svg.style.transform = `translate(${pan.current.x}px,${pan.current.y}px) scale(${zoom.current})`;
    svg.style.transformOrigin = '50% 50%';
    if (smooth) setTimeout(() => { svg.style.transition = ''; }, 320);
  }

  const handleSeatClick = useCallback((id: string) => {
    const s = seatsRef.current.find((x) => x.id === id);
    if (!s || s.renderStatus === 'sold' || s.renderStatus === 'held') return;
    if (s.renderStatus === 'selected') {
      s.renderStatus = 'available';
      selectedRef.current.delete(id);
    } else {
      s.renderStatus = 'selected';
      selectedRef.current.add(id);
    }
    refreshSeat(s);
    recalcCapacity();
    setRenderTick((t) => t + 1);
    onSelectionChange(seatsRef.current.filter((x) => selectedRef.current.has(x.id)));
  }, [onSelectionChange]);

  // Attach SVG events
  useEffect(() => {
    const g = svgRef.current?.getElementById('seatsG') as SVGGElement | null;
    if (!g) return;

const onClick = (e: globalThis.Event) => {
  const id = ((e as unknown as MouseEvent).target as SVGElement).dataset.id;
  if (id) handleSeatClick(id);
};
const onOver = (e: globalThis.Event) => {
  const me = e as unknown as MouseEvent;
  const target = me.target as SVGElement;
  const id = target.dataset.id;
  if (!id) return;
  const s = seatsRef.current.find((x) => x.id === id);
  if (!s) return;
  const STATUS_TXT: Record<SeatStatus, string> = {
    available: 'Disponible', selected: 'Seleccionado',
    held: 'En proceso de compra', sold: 'Vendido',
  };
  setTooltip({
    visible: true,
    label: `${s.sectionLabel} · Fila ${s.row} · Asiento ${s.number}`,
    sub: STATUS_TXT[s.renderStatus],
    price: s.price !== null && s.renderStatus !== 'sold'
      ? `$${s.price.toLocaleString('es-MX')} MXN` : '',
    x: me.clientX, y: me.clientY,
  });
};

const onMove = (e: globalThis.Event) => {
  const me = e as unknown as MouseEvent;
  setTooltip((t) => t.visible ? { ...t, x: me.clientX, y: me.clientY } : t);
};
    const onOut  = () => setTooltip((t) => ({ ...t, visible: false }));

    g.addEventListener('click',     onClick);
    g.addEventListener('mouseover', onOver);
    g.addEventListener('mousemove', onMove);
    g.addEventListener('mouseout',  onOut);
    return () => {
      g.removeEventListener('click',     onClick);
      g.removeEventListener('mouseover', onOver);
      g.removeEventListener('mousemove', onMove);
      g.removeEventListener('mouseout',  onOut);
    };
  }, [handleSeatClick, renderTick]);

  // Pan / zoom events on map area
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom.current = Math.min(Math.max(zoom.current * (e.deltaY > 0 ? 0.9 : 1.1), 0.5), 4);
      applyTransform();
    };
    const onMD = (e: MouseEvent) => {
      if ((e.target as HTMLElement).dataset.id) return;
      drag.current = true;
      dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.current.x, py: pan.current.y };
      area.style.cursor = 'grabbing';
    };
    const onMM = (e: MouseEvent) => {
      if (!drag.current) return;
      pan.current.x = dragStart.current.px + (e.clientX - dragStart.current.mx);
      pan.current.y = dragStart.current.py + (e.clientY - dragStart.current.my);
      applyTransform();
    };
    const onMU = () => { drag.current = false; area.style.cursor = 'grab'; };

    const onTS = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchDist.current = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      } else if (e.touches.length === 1) {
        drag.current = true;
        dragStart.current = {
          mx: e.touches[0].clientX, my: e.touches[0].clientY,
          px: pan.current.x, py: pan.current.y,
        };
      }
    };
    const onTM = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        zoom.current = Math.min(Math.max(zoom.current * (d / pinchDist.current), 0.5), 4);
        pinchDist.current = d;
        applyTransform();
      } else if (drag.current) {
        pan.current.x = dragStart.current.px + (e.touches[0].clientX - dragStart.current.mx);
        pan.current.y = dragStart.current.py + (e.touches[0].clientY - dragStart.current.my);
        applyTransform();
      }
    };
    const onTE = () => { drag.current = false; };

    area.addEventListener('wheel',      onWheel, { passive: false });
    area.addEventListener('mousedown',  onMD);
    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup',   onMU);
    area.addEventListener('touchstart', onTS, { passive: true });
    area.addEventListener('touchmove',  onTM, { passive: true });
    area.addEventListener('touchend',   onTE);
    return () => {
      area.removeEventListener('wheel',     onWheel);
      area.removeEventListener('mousedown', onMD);
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup',   onMU);
      area.removeEventListener('touchstart', onTS);
      area.removeEventListener('touchmove',  onTM);
      area.removeEventListener('touchend',   onTE);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute zone prices from rawSeats (one per section)
  const zonePrices = (() => {
    const map: Record<string, { label: string; color: string; price: number | null; currency: string }> = {};
    rawSeats.forEach((s) => {
      if (!map[s.sectionCode]) {
        map[s.sectionCode] = {
          label: s.sectionLabel, color: s.colorHex,
          price: s.price, currency: s.currency,
        };
      }
    });
    return Object.values(map);
  })();

  const selectedSeats = seatsRef.current.filter((s) => selectedRef.current.has(s.id));
  const total = selectedSeats.reduce((a, s) => a + (s.price ?? 0), 0);

  return (
    <div className="seatmap-root">
      {/* Zone prices legend */}
      <div className="sm-legend">
        {zonePrices.map((z) => (
          <div key={z.label} className="sm-zone">
            <span className="sm-zone-dot" style={{ background: z.color }} />
            <span className="sm-zone-name">{z.label}</span>
            <span className="sm-zone-price">
              {z.price !== null ? `$${z.price.toLocaleString('es-MX')} ${z.currency}` : '—'}
            </span>
          </div>
        ))}
        <div className="sm-zone">
          <span className="sm-zone-dot" style={{ background: 'var(--gold)' }} />
          <span className="sm-zone-name">Seleccionado</span>
        </div>
        <div className="sm-zone">
          <span className="sm-zone-dot" style={{ background: 'var(--warn)', opacity: 0.75 }} />
          <span className="sm-zone-name">En proceso</span>
        </div>
        <div className="sm-zone">
          <span className="sm-zone-dot" style={{ background: 'var(--text-faint)', opacity: 0.5 }} />
          <span className="sm-zone-name">Vendido</span>
        </div>
      </div>

      {/* Map viewport */}
      <div className="sm-viewport" ref={areaRef} style={{ cursor: 'grab' }}>
        {/* Capacity bars */}
        <div className="sm-capbar">
          {(['CTR','IZQ','DER'] as const).map((sec) => (
            <div key={sec} className="sm-cap-item">
              <span className="sm-cap-label">{ sec === 'CTR' ? 'Central' : sec === 'IZQ' ? 'Izq.' : 'Der.' }</span>
              <div className="sm-cap-track">
                <div
                  className={`sm-cap-fill${capacity[sec] >= 90 ? ' full' : capacity[sec] >= 70 ? ' warn' : ''}`}
                  style={{ width: capacity[sec] + '%' }}
                />
              </div>
              <span className="sm-cap-pct">{capacity[sec]}%</span>
            </div>
          ))}
        </div>

        {/* Pan hint */}
        <div className="sm-hint">Scroll para zoom · Arrastra para navegar</div>

        {/* SVG */}
        <svg
          ref={svgRef}
          id="svgMapReact"
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          height="100%"
          viewBox="0 0 860 680"
          preserveAspectRatio="xMidYMid meet"
          style={{ touchAction: 'none', userSelect: 'none' }}
        >
          <defs>
            <linearGradient id="sg" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="var(--accent)" stopOpacity=".07" />
              <stop offset="50%"  stopColor="var(--accent)" stopOpacity=".22" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity=".07" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Stage */}
          <rect x="260" y="16" width="340" height="52" rx="10" fill="url(#sg)" />
          <rect x="260" y="16" width="340" height="52" rx="10" stroke="var(--accent)" strokeWidth="1.5" fill="none" />
          <text x="430" y="48" textAnchor="middle" dominantBaseline="central"
                fontFamily="Satoshi,sans-serif" fontSize="12" fontWeight="700"
                fill="var(--accent)" letterSpacing=".12em">ESCENARIO</text>
          <path d="M260 68 Q430 106 600 68" stroke="var(--border)" strokeWidth="1"
                fill="none" strokeDasharray="5 4" opacity=".6" />
          {/* Section labels */}
          <text x="115" y="106" className="slbl">Sección Izq.</text>
          <text x="430" y="106" className="slbl">Sección Central</text>
          <text x="745" y="106" className="slbl">Sección Der.</text>
          {/* Seats rendered imperatively via DOM */}
          <g id="seatsG" />
        </svg>

        {/* Zoom controls */}
        <div className="sm-zoom">
          <button className="sm-zoom-btn" onClick={() => { zoom.current = Math.min(zoom.current * 1.3, 4); applyTransform(); }}>+</button>
          <button className="sm-zoom-btn" onClick={() => { zoom.current = Math.max(zoom.current / 1.3, 0.5); applyTransform(); }}>−</button>
          <button className="sm-zoom-btn sm-zoom-rst" onClick={() => { zoom.current = 1; pan.current = { x: 0, y: 0 }; applyTransform(true); }}>⊙</button>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip.visible && (
        <div className="sm-tip" style={{ left: tooltip.x + 14, top: tooltip.y - 8 }}>
          <div className="sm-tip-id">{tooltip.label}</div>
          <div className="sm-tip-sub">{tooltip.sub}</div>
          {tooltip.price && <div className="sm-tip-price">{tooltip.price}</div>}
        </div>
      )}

      {/* Selected seats summary */}
      {selectedSeats.length > 0 && (
        <div className="sm-selection">
          <div className="sm-sel-header">
            <span className="sm-sel-title">
              Mis asientos <span className="sm-sel-badge">{selectedSeats.length}</span>
            </span>
            <span className="sm-sel-total" style={{ color: accentColor }}>
              ${total.toLocaleString('es-MX')} MXN
            </span>
          </div>
          <div className="sm-sel-list">
            {selectedSeats.map((s) => (
              <div key={s.id} className="sm-sel-item">
                <div>
                  <div className="sm-sel-id">{s.id}</div>
                  <div className="sm-sel-sub">{s.sectionLabel} · ${(s.price ?? 0).toLocaleString('es-MX')} MXN</div>
                </div>
                <button
                  className="sm-sel-rm"
                  onClick={() => handleSeatClick(s.id)}
                  aria-label="Quitar asiento"
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Checkout Page ───────────────────────────────────────────────────────

export default function CheckoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [event, setEvent]             = useState<EventDetail | null>(null);
  const [seats, setSeats]             = useState<SeatData[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<RenderSeat[]>([]);
  const [loading, setLoading]         = useState(true);
  const [seatsLoading, setSeatsLoading] = useState(false);

  // Classic mode state
  const [qty, setQty]                 = useState(1);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  const [buying, setBuying]           = useState(false);
  const [error, setError]             = useState('');

  const color = event ? colorFor(event.title) : '#00c2b3';
  const abbr  = event ? initials(event.title) : '';

  // Auth guard
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace(`/login?redirectTo=/checkout/${id}`);
    });
  }, [id, router]);

  // Fetch event
  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE_URL}/events/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setEvent(d);
          if (d.ticketTypes?.length > 0) setSelectedTypeId(d.ticketTypes[0].id);
        }
      })
      .catch(() => setError('No se pudo cargar el evento.'))
      .finally(() => setLoading(false));
  }, [id]);

  // Fetch seat map when event uses venue map
  useEffect(() => {
    if (!event?.useVenueMap || !id) return;
    setSeatsLoading(true);
    fetch(`${API_BASE_URL}/events/${id}/seat-map`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: SeatData[]) => {
       console.log('seat-map response:', data); 
  setSeats(data);
})
      .catch(() => setError('No se pudo cargar el mapa de asientos.'))
      .finally(() => setSeatsLoading(false));
  }, [event, id]);

  // ── Classic mode buy ──
  const ticketTypes       = event?.ticketTypes ?? [];
  const selectedTicketType = ticketTypes.find((t) => t.id === selectedTypeId) ?? ticketTypes[0] ?? null;
  const ticketPrice       = selectedTicketType ? Number(selectedTicketType.price) : 0;
  const ticketName        = selectedTicketType?.name ?? 'Entrada general';
  const hasTicketTypes    = ticketTypes.length > 0;
  const classicTotal      = qty * ticketPrice;

  // ── Seat map buy ──
  const mapTotal = selectedSeats.reduce((a, s) => a + (s.price ?? 0), 0);
  const canBuyMap = selectedSeats.length > 0;

  async function handleBuy() {
    if (!event) return;
    setBuying(true);
    setError('');

    try {
      const supabase = createClient();
      const { data: { session }, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error('No se pudo obtener la sesión');
      if (!session?.access_token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');

      if (event.useVenueMap) {
        // ── Seat-map mode: POST one ticket per seat ──
        if (selectedSeats.length === 0) {
          setError('Selecciona al menos un asiento.');
          return;
        }
        // POST with seatIds array (your tickets endpoint must support this)
        const res = await fetch(`${API_BASE_URL}/tickets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            eventId: event.id,
            seatIds: selectedSeats.map((s) => s.id),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Error ${res.status}`);
        }
        const order = await res.json();
        router.push(`/tickets/${order.id ?? order[0]?.id}?new=1`);
      } else {
        // ── Classic ticket-type mode ──
        if (!selectedTicketType) {
          setError('No hay tipo de boleto disponible para este evento.');
          return;
        }
        const res = await fetch(`${API_BASE_URL}/tickets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            eventId: event.id,
            ticketTypeId: selectedTicketType.id,
            quantity: qty,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Error ${res.status}`);
        }
        const ticket = await res.json();
        router.push(`/tickets/${ticket.id}?new=1`);
      }
    } catch (e: any) {
      setError(e.message ?? 'Ocurrió un error al procesar la compra.');
    } finally {
      setBuying(false);
    }
  }

  const displayTotal = event?.useVenueMap ? mapTotal : classicTotal;
  const canBuy = event?.useVenueMap ? canBuyMap : hasTicketTypes;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="page-root">
        {/* Nav */}
        <nav className="top-nav">
          <div className="nav-inner">
            <Link href={`/events/${id}`} className="back-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Regresar
            </Link>
            <span className="nav-title">Checkout</span>
          </div>
        </nav>

        <main className={`checkout-layout${event?.useVenueMap ? ' checkout-layout--wide' : ''}`}>
          {loading ? (
            <div className="loading-state"><div className="spinner" /></div>
          ) : !event ? (
            <div className="error-state">
              <p>No se encontró el evento.</p>
              <Link href="/discover" className="back-link">← Regresar a Descubrir</Link>
            </div>
          ) : (
            <>
              {/* Event summary card */}
              <section className="event-summary" aria-label="Resumen del evento">
                <div className="summary-banner" style={{ background: `linear-gradient(135deg, ${color}20 0%, #0e0e0f 100%)` }}>
                  <div className="summary-avatar" style={{ background: color }}>{abbr}</div>
                </div>
                <div className="summary-body">
                  <h1 className="summary-title">{event.title}</h1>
                  <div className="summary-meta-row">
                    <span className="summary-meta">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      {fmtDate(event.startsAt)}, {fmtTime(event.startsAt)}
                    </span>
                    <span className="summary-meta">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                      </svg>
                      {event.venueName}, {event.venueCity}
                    </span>
                  </div>
                </div>
              </section>

              {/* ── Seat-map mode ── */}
              {event.useVenueMap ? (
                <>
                  <section className="map-section" aria-label="Mapa de asientos">
                    <h2 className="section-label">Selecciona tus asientos</h2>
                    {seatsLoading ? (
                      <div className="loading-state"><div className="spinner" /></div>
                    ) : (
                      <SeatMap
                        seats={seats}
                        onSelectionChange={setSelectedSeats}
                        accentColor={color}
                      />
                    )}
                  </section>

                  {/* Order summary (seat map) */}
                  <section className="order-summary" aria-label="Resumen de orden">
                    <h2 className="section-label">Resumen de orden</h2>
                    <div className="order-lines">
                      {selectedSeats.length === 0 ? (
                        <p className="qty-hint">Selecciona asientos en el mapa para continuar.</p>
                      ) : (
                        <>
                          {selectedSeats.map((s) => (
                            <div key={s.id} className="order-line">
                              <span>{s.id} — {s.sectionLabel}</span>
                              <span>${(s.price ?? 0).toLocaleString('es-MX')} MXN</span>
                            </div>
                          ))}
                          <div className="order-line muted">
                            <span>Cargos por servicio</span><span>Incluidos</span>
                          </div>
                          <div className="order-divider" />
                          <div className="order-line total">
                            <span>Total</span>
                            <span style={{ color }}>${mapTotal.toLocaleString('es-MX')} MXN</span>
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                </>
              ) : (
                /* ── Classic ticket-type mode ── */
                <>
                  {!hasTicketTypes ? (
                    <section className="ticket-selector">
                      <p className="qty-hint">Este evento todavía no tiene tipos de boleto configurados.</p>
                    </section>
                  ) : (
                    <>
                      <section className="ticket-selector" aria-label="Seleccionar boletos">
                        <h2 className="section-label">Selecciona tu boleto</h2>
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
                        <div className="ticket-row" style={{ marginTop: '1rem' }}>
                          <div className="ticket-info">
                            <span className="ticket-name">{ticketName}</span>
                            <span className="ticket-price">${ticketPrice.toLocaleString('es-MX')} MXN por boleto</span>
                          </div>
                          <div className="qty-control" role="group" aria-label="Cantidad de boletos">
                            <button className="qty-btn" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Quitar boleto">−</button>
                            <span className="qty-value" aria-live="polite">{qty}</span>
                            <button className="qty-btn" onClick={() => setQty((q) => Math.min(10, q + 1))} disabled={qty >= 10} aria-label="Agregar boleto">+</button>
                          </div>
                        </div>
                        <p className="qty-hint">Máximo 10 boletos por compra</p>
                      </section>

                      <section className="order-summary" aria-label="Resumen de orden">
                        <h2 className="section-label">Resumen de orden</h2>
                        <div className="order-lines">
                          <div className="order-line">
                            <span>{ticketName} × {qty}</span>
                            <span>${(qty * ticketPrice).toLocaleString('es-MX')} MXN</span>
                          </div>
                          <div className="order-line muted"><span>Cargos por servicio</span><span>Incluidos</span></div>
                          <div className="order-divider" />
                          <div className="order-line total">
                            <span>Total</span>
                            <span style={{ color }}>${classicTotal.toLocaleString('es-MX')} MXN</span>
                          </div>
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}

              {/* Error */}
              {error && (
                <div className="error-banner" role="alert">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </div>
              )}

              {/* CTA */}
              <button
                className="buy-btn"
                style={{ background: color }}
                onClick={handleBuy}
                disabled={buying || !canBuy}
                aria-busy={buying}
              >
                {buying ? (
                  <><div className="btn-spinner" /><span>Procesando…</span></>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Confirmar compra · ${displayTotal.toLocaleString('es-MX')} MXN</span>
                  </>
                )}
              </button>
              <p className="buy-note">Al confirmar aceptas los términos de uso. Sin reembolsos.</p>
            </>
          )}
        </main>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');
  :root {
    --bg:#0e0e0f; --surface:#141415; --surface-2:#1a1a1c; --surface-3:#212124;
    --border:oklch(1 0 0/0.08); --border-hover:oklch(1 0 0/0.16);
    --text:#e8e8e9; --text-muted:#8a8a8e; --text-faint:#4a4a50;
    --accent:#00c2b3; --accent-dim:oklch(0.6 0.12 185/0.15);
    --gold:#e8b934; --warn:#bb653b; --faint:#4a4a50;
    --radius-sm:6px; --radius-md:10px; --radius-lg:14px; --radius-xl:18px;
    --tr:180ms cubic-bezier(0.16,1,0.3,1);
    --font:'Satoshi','Inter',system-ui,sans-serif;
  }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  .page-root{min-height:100vh;background:var(--bg);color:var(--text);font-family:var(--font);font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased;}

  /* NAV */
  .top-nav{border-bottom:1px solid var(--border);padding:0.85rem clamp(1rem,4vw,2.5rem);position:sticky;top:0;background:oklch(0.1 0 0/0.85);backdrop-filter:blur(12px);z-index:50;display:flex;align-items:center;}
  .nav-inner{max-width:900px;margin:0 auto;width:100%;display:flex;align-items:center;justify-content:space-between;}
  .back-btn{display:inline-flex;align-items:center;gap:0.4rem;color:var(--text-muted);font-size:0.875rem;font-weight:500;text-decoration:none;transition:color var(--tr);}
  .back-btn:hover{color:var(--text);}
  .nav-title{font-size:0.875rem;font-weight:600;color:var(--text-muted);}

  /* LAYOUT */
  .checkout-layout{max-width:600px;margin:0 auto;padding:2rem clamp(1rem,4vw,1.5rem) 4rem;display:flex;flex-direction:column;gap:1.25rem;}
  .checkout-layout--wide{max-width:900px;}

  /* EVENT SUMMARY */
  .event-summary{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);overflow:hidden;}
  .summary-banner{height:72px;position:relative;display:flex;align-items:flex-end;padding:0 1.25rem 0.875rem;}
  .summary-avatar{width:44px;height:44px;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:700;color:#0e0e0f;box-shadow:0 2px 8px oklch(0 0 0/0.4);}
  .summary-body{padding:0.875rem 1.25rem 1.1rem;}
  .summary-title{font-size:1rem;font-weight:700;color:var(--text);letter-spacing:-0.01em;margin-bottom:0.5rem;}
  .summary-meta-row{display:flex;flex-direction:column;gap:0.3rem;}
  .summary-meta{display:flex;align-items:center;gap:0.4rem;font-size:0.8rem;color:var(--text-muted);}

  /* SECTION LABEL */
  .section-label{font-size:0.72rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-faint);margin-bottom:0.9rem;}

  /* MAP SECTION */
  .map-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);padding:1.25rem;}

  /* SEAT MAP ROOT */
  .seatmap-root{display:flex;flex-direction:column;gap:0.875rem;}

  /* ZONE LEGEND */
  .sm-legend{display:flex;flex-wrap:wrap;gap:0.5rem 1rem;}
  .sm-zone{display:flex;align-items:center;gap:0.4rem;font-size:0.75rem;color:var(--text-muted);}
  .sm-zone-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
  .sm-zone-name{color:var(--text-muted);}
  .sm-zone-price{font-weight:700;color:var(--text);margin-left:0.25rem;}

  /* MAP VIEWPORT */
  .sm-viewport{position:relative;height:420px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;}
  @media(max-width:640px){.sm-viewport{height:300px;}}

  /* CAPACITY BAR */
  .sm-capbar{position:absolute;top:10px;left:10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:8px 12px;display:flex;gap:16px;z-index:5;box-shadow:0 2px 8px oklch(0 0 0/.3);}
  .sm-cap-item{display:flex;flex-direction:column;gap:3px;min-width:52px;}
  .sm-cap-label{font-size:0.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-faint);}
  .sm-cap-track{height:4px;background:var(--border);border-radius:9999px;overflow:hidden;}
  .sm-cap-fill{height:100%;background:var(--accent);border-radius:9999px;transition:width 600ms cubic-bezier(0.16,1,0.3,1);}
  .sm-cap-fill.warn{background:var(--gold);}
  .sm-cap-fill.full{background:#d163a7;}
  .sm-cap-pct{font-size:0.65rem;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;}

  /* HINT */
  .sm-hint{position:absolute;top:10px;left:50%;transform:translateX(-50%);font-size:0.72rem;color:var(--text-faint);background:var(--surface);border:1px solid var(--border);border-radius:9999px;padding:3px 10px;white-space:nowrap;z-index:5;pointer-events:none;}

  /* ZOOM */
  .sm-zoom{position:absolute;bottom:14px;right:14px;display:flex;flex-direction:column;gap:4px;z-index:10;}
  .sm-zoom-btn{width:32px;height:32px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:700;color:var(--text-muted);cursor:pointer;transition:background var(--tr),color var(--tr);}
  .sm-zoom-btn:hover{background:var(--surface-3);color:var(--text);}
  .sm-zoom-rst{font-size:0.6rem;letter-spacing:.05em;font-weight:600;}

  /* SVG SEAT CLASSES (applied by DOM manipulation) */
  .seatmap-root .seat{transition:transform 110ms cubic-bezier(0.16,1,0.3,1),fill 110ms ease;cursor:pointer;transform-box:fill-box;transform-origin:center;}
  .seatmap-root .seat.available:hover{transform:scale(1.25);filter:brightness(1.15);}
  .seatmap-root .seat.selected{animation:pop 260ms cubic-bezier(0.16,1,0.3,1) both;}
  .seatmap-root .seat.sold,.seatmap-root .seat.held{cursor:not-allowed;}
  @keyframes pop{0%{transform:scale(.6)}65%{transform:scale(1.25)}100%{transform:scale(1)}}
  .rlbl{font-family:'Satoshi',sans-serif;font-size:9px;font-weight:600;fill:var(--text-faint);pointer-events:none;user-select:none;dominant-baseline:central;text-anchor:middle;}
  .slbl{font-family:'Satoshi',sans-serif;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;fill:var(--text-faint);pointer-events:none;user-select:none;text-anchor:middle;}

  /* TOOLTIP */
  .sm-tip{position:fixed;z-index:200;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);padding:6px 10px;font-size:0.75rem;color:var(--text);box-shadow:0 4px 12px oklch(0 0 0/.3);pointer-events:none;white-space:nowrap;}
  .sm-tip-id{font-weight:700;margin-bottom:2px;}
  .sm-tip-sub{color:var(--text-muted);}
  .sm-tip-price{color:var(--accent);font-weight:700;margin-top:3px;}

  /* SELECTED SEATS PANEL */
  .sm-selection{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);padding:1rem 1.25rem;}
  .sm-sel-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;}
  .sm-sel-title{font-size:0.72rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-faint);display:flex;align-items:center;gap:0.4rem;}
  .sm-sel-badge{background:var(--accent);color:#0e0e0f;border-radius:9999px;font-size:0.65rem;font-weight:700;padding:1px 7px;}
  .sm-sel-total{font-size:1rem;font-weight:700;font-variant-numeric:tabular-nums;}
  .sm-sel-list{display:flex;flex-direction:column;gap:0.4rem;}
  .sm-sel-item{display:flex;align-items:center;justify-content:space-between;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);padding:0.5rem 0.75rem;font-size:0.75rem;animation:slideIn 200ms cubic-bezier(0.16,1,0.3,1);}
  @keyframes slideIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}
  .sm-sel-id{font-weight:700;color:var(--text);}
  .sm-sel-sub{color:var(--text-muted);margin-top:1px;}
  .sm-sel-rm{color:var(--text-faint);font-size:1.1rem;line-height:1;cursor:pointer;transition:color var(--tr);padding:2px 4px;border-radius:4px;}
  .sm-sel-rm:hover{color:#d163a7;}

  /* TICKET SELECTOR (classic) */
  .ticket-selector{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);padding:1.25rem;}
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
  .ticket-type-list{display:flex;flex-direction:column;gap:0.5rem;}
  .ticket-type-card{width:100%;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.7rem 0.875rem;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;transition:border-color var(--tr),box-shadow var(--tr),background var(--tr);font-family:var(--font);text-align:left;}
  .ticket-type-card:hover{background:var(--surface-3);border-color:var(--border-hover);}
  .ttc-left{display:flex;align-items:center;gap:0.6rem;}
  .ttc-check{width:18px;height:18px;border-radius:9999px;border:1.5px solid var(--border-hover);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background var(--tr),border-color var(--tr);}
  .ttc-name{font-size:0.875rem;font-weight:600;color:var(--text);}
  .ttc-price{font-size:0.82rem;font-weight:600;color:var(--text-muted);white-space:nowrap;transition:color var(--tr);}

  /* ORDER SUMMARY */
  .order-summary{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);padding:1.25rem;}
  .order-lines{display:flex;flex-direction:column;gap:0.6rem;}
  .order-line{display:flex;justify-content:space-between;align-items:center;font-size:0.875rem;color:var(--text);}
  .order-line.muted{color:var(--text-faint);font-size:0.8rem;}
  .order-line.total{font-weight:700;font-size:0.95rem;}
  .order-divider{height:1px;background:var(--border);margin:0.4rem 0;}

  /* ERROR */
  .error-banner{display:flex;align-items:center;gap:0.6rem;background:oklch(0.35 0.1 15/0.15);border:1px solid oklch(0.45 0.15 15/0.35);border-radius:var(--radius-lg);padding:0.75rem 1rem;font-size:0.875rem;color:#f87171;}

  /* CTA */
  .buy-btn{width:100%;padding:0.95rem;border:none;border-radius:var(--radius-lg);color:#0e0e0f;font-family:var(--font);font-size:0.95rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;transition:opacity var(--tr),transform var(--tr);}
  .buy-btn:hover:not(:disabled){opacity:0.88;transform:translateY(-1px);}
  .buy-btn:active:not(:disabled){transform:translateY(0);}
  .buy-btn:disabled{opacity:0.55;cursor:not-allowed;transform:none;}
  .buy-note{font-size:0.72rem;color:var(--text-faint);text-align:center;}

  /* SPINNERS */
  @keyframes spin{to{transform:rotate(360deg)}}
  .spinner{width:28px;height:28px;border:2px solid var(--surface-3);border-top-color:var(--accent);border-radius:9999px;animation:spin 0.7s linear infinite;margin:4rem auto;}
  .btn-spinner{width:16px;height:16px;border:2px solid oklch(0 0 0/0.3);border-top-color:#0e0e0f;border-radius:9999px;animation:spin 0.7s linear infinite;flex-shrink:0;}

  .loading-state{display:flex;justify-content:center;padding:4rem 0;}
  .error-state{text-align:center;padding:4rem 0;color:var(--text-muted);}
  .back-link{display:inline-flex;align-items:center;color:var(--accent);font-size:0.875rem;font-weight:500;text-decoration:none;margin-top:0.75rem;}
`;
