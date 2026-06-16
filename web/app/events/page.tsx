'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/supabase/api';
import { enablePushNotifications, disablePushNotifications } from '@/lib/usePushNotifications';


interface TicketTypeRecord {
  id: string;
  name: string;
  price: string; // serialized as string by the API (Decimal)
  currency: string;
  capacity: number;
  description?: string;
}

interface SectionPriceRecord {
  section: { code: string; label: string; colorHex: string };
  price: string;
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
  createdAt: string;
  updatedAt: string;
  bannerUrl?: string;
  category?: 'music' | 'theater' | 'sport' | 'festival' | 'other';
  useVenueMap?: boolean;
  ticketTypes?: TicketTypeRecord[];
  eventSectionPrices?: SectionPriceRecord[];
}

interface Profile {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

// Las secciones del Auditorio ESCOM que corresponden al mapa HTML
interface SectionPrice {
  sectionCode: string;   // "IZQ" | "CTR" | "DER"
  sectionLabel: string;  // "Izquierda" | "Central" | "Derecha"
  colorHex: string;
  price: string;         // string para el input, se convierte a número al enviar
}

// Ticket type libre (cuando no se usa el mapa)
// `id` está presente al editar tipos existentes, ausente en nuevos
interface FreeTicketType {
  id?: string;
  name: string;
  description: string;
  price: string;
  capacity: string;
}

const VENUE_SECTIONS: Omit<SectionPrice, 'price'>[] = [
  { sectionCode: 'CTR', sectionLabel: 'Central',   colorHex: '#4f98a3' },
  { sectionCode: 'IZQ', sectionLabel: 'Izquierda', colorHex: '#7eb3bc' },
  { sectionCode: 'DER', sectionLabel: 'Derecha',   colorHex: '#7eb3bc' },
];

const DEFAULT_SECTION_PRICES: SectionPrice[] = VENUE_SECTIONS.map(s => ({
  ...s,
  price: '',
}));

const EMPTY_TICKET_TYPE: FreeTicketType = {
  name: '',
  description: '',
  price: '',
  capacity: '',
};

/* ─── Helpers ────────────────────────────────────────────── */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Convierte "2025-04-10T20:00:00.000Z" al formato requerido por datetime-local input
function isoToLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ─── Animation Variants ─────────────────────────────────── */
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, damping: 26, stiffness: 220 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as [number, number, number, number] } },
};

const headerVariants = {
  hidden: { opacity: 0, y: -20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, damping: 20, stiffness: 300, delay: 0.1 },
  },
};

const formVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, damping: 20, stiffness: 300 },
  },
  exit: {
    opacity: 0, y: 20, scale: 0.98,
    transition: { type: 'spring' as const, damping: 20, stiffness: 300 },
  },
};

const slideVariants: Variants = {
  hidden: { opacity: 0, height: 0, overflow: 'hidden' },
  show: {
    opacity: 1, height: 'auto', overflow: 'hidden',
    transition: { duration: 0.35, ease: 'easeOut' as const },
  },
  exit: {
    opacity: 0, height: 0, overflow: 'hidden',
    transition: { duration: 0.25, ease: 'easeIn' as const },
  },
};

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

/* ─── VenueMap (mini-preview) ────────────────────────────── */
function VenueMap({ prices }: { prices: SectionPrice[] }) {
  return (
    <div className="venue-map">
      <div className="vm-stage">ESCENARIO</div>
      <div className="vm-sections">
        <div className="vm-section vm-izq">
          <span className="vm-sec-label">Izquierda</span>
          <span className="vm-sec-price vm-free">GRATIS</span>
        </div>
        <div className="vm-section vm-ctr">
          <span className="vm-sec-label">Central</span>
          <span className="vm-sec-price vm-free">GRATIS</span>
        </div>
        <div className="vm-section vm-der">
          <span className="vm-sec-label">Derecha</span>
          <span className="vm-sec-price vm-free">GRATIS</span>
        </div>
      </div>
      <div className="vm-audience">← Público →</div>
    </div>
  );
}

/* ─── Section Price Editor ───────────────────────────────── */
function SectionPriceEditor({
  prices,
  onChange,
}: {
  prices: SectionPrice[];
  onChange: (updated: SectionPrice[]) => void;
}) {
  return (
    <div className="section-price-editor">
      <div className="escom-free-notice">
        <span className="escom-free-icon">🎓</span>
        <div>
          <strong>Auditorio ESCOM — Recinto académico</strong>
          <p>Al ser un espacio institucional no se puede cobrar entrada. Todos los boletos de este evento son <strong>gratuitos</strong> automáticamente.</p>
        </div>
      </div>
      <VenueMap prices={prices} />
    </div>
  );
}

/* ─── Free Ticket Types Editor ───────────────────────────── */
function FreeTicketTypesEditor({
  types,
  onChange,
}: {
  types: FreeTicketType[];
  onChange: (updated: FreeTicketType[]) => void;
}) {
  function handleChange(index: number, field: keyof FreeTicketType, value: string) {
    onChange(types.map((t, i) => i === index ? { ...t, [field]: value } : t));
  }

  function addType() {
    onChange([...types, { ...EMPTY_TICKET_TYPE }]);
  }

  function removeType(index: number) {
    onChange(types.filter((_, i) => i !== index));
  }

  return (
    <div className="free-ticket-editor">
      <p className="section-price-hint">
        Define los tipos de boleto para tu evento. Puedes crear tantos como necesites (General, VIP, Estudiante, etc.).
      </p>

      <div className="ticket-types-list">
        {types.map((tt, i) => (
          <div key={tt.id ?? i} className="ticket-type-card">
            <div className="ticket-type-header">
              <span className="ticket-type-num">
                Tipo #{i + 1}
                {tt.id && <span className="ticket-type-existing"> · existente</span>}
              </span>
              {types.length > 1 && (
                <button
                  type="button"
                  className="ticket-type-remove"
                  onClick={() => removeType(i)}
                  aria-label="Eliminar tipo"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="form-row two-col">
              <div className="field">
                <label>Nombre</label>
                <input
                  type="text"
                  placeholder="Ej. General, VIP, Estudiante…"
                  value={tt.name}
                  onChange={e => handleChange(i, 'name', e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Precio (MXN)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={tt.price}
                  onChange={e => handleChange(i, 'price', e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-row two-col">
              <div className="field">
                <label>Descripción <span className="field-optional">(opcional)</span></label>
                <input
                  type="text"
                  placeholder="Descripción breve del tipo de boleto"
                  value={tt.description}
                  onChange={e => handleChange(i, 'description', e.target.value)}
                />
              </div>
              <div className="field">
                <label>Capacidad</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Ej. 100"
                  value={tt.capacity}
                  onChange={e => handleChange(i, 'capacity', e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-add-type" onClick={addType}>
        + Agregar otro tipo de boleto
      </button>
    </div>
  );
}

/* ─── Venue Mode Toggle ──────────────────────────────────── */
function VenueModeToggle({
  useMap,
  onChange,
  disabled,
}: {
  useMap: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="venue-mode-toggle">
      <p className="venue-mode-title">
        ¿Cómo se gestionan los boletos de este evento?
        {disabled && (
          <span className="venue-mode-locked" title="El modo no se puede cambiar si ya se han vendido boletos">
            {' '}🔒 No editable con boletos vendidos
          </span>
        )}
      </p>
      <div className="venue-mode-options">
        <button
          type="button"
          className={`venue-mode-option ${useMap ? 'active' : ''} ${disabled ? 'locked' : ''}`}
          onClick={() => !disabled && onChange(true)}
          disabled={disabled}
        >
          <span className="vmo-icon" aria-hidden="true">🗺️</span>
          <div className="vmo-content">
            <span className="vmo-label">Mapa del Auditorio ESCOM</span>
            <span className="vmo-desc">Asientos numerados con precios por sección</span>
          </div>
          {useMap && <span className="vmo-check">✓</span>}
        </button>
        <button
          type="button"
          className={`venue-mode-option ${!useMap ? 'active' : ''} ${disabled ? 'locked' : ''}`}
          onClick={() => !disabled && onChange(false)}
          disabled={disabled}
        >
          <span className="vmo-icon" aria-hidden="true">🎟️</span>
          <div className="vmo-content">
            <span className="vmo-label">Tipos de boleto libres</span>
            <span className="vmo-desc">General, VIP u otras categorías personalizadas</span>
          </div>
          {!useMap && <span className="vmo-check">✓</span>}
        </button>
      </div>
    </div>
  );
}

/* ─── Helpers para cargar datos de un evento en el form ──── */
function eventToFormFields(event: Event) {
  return {
    title: event.title,
    description: event.description ?? '',
    venueName: event.venueName,
    venueCity: event.venueCity,
    startsAt: isoToLocalInput(event.startsAt),
    endsAt: isoToLocalInput(event.endsAt),
    bannerUrl: event.bannerUrl ?? '',
    category: (event.category ?? 'other') as Event['category'],
  };
}

function eventToSectionPrices(event: Event): SectionPrice[] {
  if (!event.eventSectionPrices || event.eventSectionPrices.length === 0) {
    return DEFAULT_SECTION_PRICES;
  }
  return VENUE_SECTIONS.map(vs => {
    const existing = event.eventSectionPrices!.find(
      sp => sp.section.code === vs.sectionCode,
    );
    return {
      ...vs,
      price: existing ? existing.price.toString() : '',
    };
  });
}

function eventToFreeTicketTypes(event: Event): FreeTicketType[] {
  if (!event.ticketTypes || event.ticketTypes.length === 0) {
    return [{ ...EMPTY_TICKET_TYPE }];
  }
  return event.ticketTypes.map(tt => ({
    id: tt.id,
    name: tt.name,
    description: tt.description ?? '',
    price: tt.price.toString(),
    capacity: tt.capacity.toString(),
  }));
}

/* ─── Main Page ──────────────────────────────────────────── */
export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Estado del formulario (crear o editar) ───────────────
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const router = useRouter();

  const [form, setForm] = useState({
    title: '', description: '', venueName: '', venueCity: '', startsAt: '', endsAt: '',
    bannerUrl: '', category: 'other' as Event['category'],
  });

  const [useVenueMap, setUseVenueMap] = useState(true);
  const [sectionPrices, setSectionPrices] = useState<SectionPrice[]>(DEFAULT_SECTION_PRICES);
  const [freeTicketTypes, setFreeTicketTypes] = useState<FreeTicketType[]>([{ ...EMPTY_TICKET_TYPE }]);

  // ── Push notifications ───────────────────────────────────
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const supabase = createClient();
  const isOrganizer = profile?.role === 'ORGANIZER';
  const showForm = formMode !== null;

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

  // ── Detectar si ya hay suscripción push activa ───────────
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => setPushEnabled(!!sub))
    );
  }, []);

  // ── Toggle push notifications ────────────────────────────
  async function handleTogglePush() {
    setPushLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Debes iniciar sesión primero.'); return; }

      if (pushEnabled) {
        await disablePushNotifications(API_BASE_URL, session.access_token);
        setPushEnabled(false);
        setSuccessMsg('Notificaciones desactivadas.');
      } else {
        const granted = await Notification.requestPermission();
        if (granted !== 'granted') {
          setError('Permiso de notificaciones denegado. Habilítalo en la configuración del navegador.');
          return;
        }
        const ok = await enablePushNotifications(API_BASE_URL, session.access_token);
        if (ok) {
          setPushEnabled(true);
          setSuccessMsg('Notificaciones activadas. Recibirás avisos de nuevos eventos.');
        }
      }
    } catch (err: any) {
      setError(err.message ?? 'Error al gestionar notificaciones.');
    } finally {
      setPushLoading(false);
      setTimeout(() => setSuccessMsg(''), 3500);
    }
  }

  // ── Abrir formulario de creación ─────────────────────────
  function openCreateForm() {
    setEditingEvent(null);
    setForm({ title: '', description: '', venueName: '', venueCity: '', startsAt: '', endsAt: '', bannerUrl: '', category: 'other' });
    setSectionPrices(DEFAULT_SECTION_PRICES);
    setFreeTicketTypes([{ ...EMPTY_TICKET_TYPE }]);
    setUseVenueMap(true);
    setError('');
    setFormMode('create');
  }

  // ── Abrir formulario de edición ──────────────────────────
  function openEditForm(event: Event) {
    setEditingEvent(event);
    setForm(eventToFormFields(event));
    setUseVenueMap(event.useVenueMap ?? true);
    setSectionPrices(eventToSectionPrices(event));
    setFreeTicketTypes(eventToFreeTicketTypes(event));
    setError('');
    setFormMode('edit');
    // Scroll suave al formulario
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  // ── Cerrar formulario ────────────────────────────────────
  function closeForm() {
    setFormMode(null);
    setEditingEvent(null);
    setError('');
  }

  // ── Validación compartida ────────────────────────────────
  function validateForm(): string | null {
    // En modo mapa (Auditorio ESCOM) no hay precios que validar: siempre son gratis.
    if (!useVenueMap) {
      const invalidType = freeTicketTypes.some(
        tt => !tt.name.trim() || !tt.price || Number(tt.price) <= 0 ||
              !tt.capacity || Number(tt.capacity) < 1
      );
      if (invalidType) return 'Por favor completa nombre, precio y capacidad de todos los tipos de boleto.';
    }

    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) {
  return 'La fecha de fin debe ser posterior a la fecha de inicio.';
}
    return null;
  }

  // ── Crear evento ─────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) { setError(validationError); return; }

    setActionLoading('create');
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const body: Record<string, unknown> = {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        useVenueMap,
      };

      if (useVenueMap) {
        // Auditorio ESCOM: siempre gratuito, el backend también lo fuerza a 0
        body.sectionPrices = sectionPrices.map(sp => ({
          sectionCode: sp.sectionCode,
          price: 0,
          currency: 'MXN',
        }));
      } else {
        body.ticketTypes = freeTicketTypes.map(tt => ({
          name: tt.name.trim(),
          description: tt.description.trim() || undefined,
          price: tt.price,
          currency: 'MXN',
          capacity: parseInt(tt.capacity, 10),
        }));
      }

      const res = await fetch(`${API_BASE_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Error al crear evento'); }

      closeForm();
      setSuccessMsg('Evento creado correctamente.');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  }

  // ── Actualizar evento ────────────────────────────────────
  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEvent) return;
    setError('');

    const validationError = validateForm();
    if (validationError) { setError(validationError); return; }

    setActionLoading('update');
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Solo mandamos los campos que cambiaron en base del evento
      const body: Record<string, unknown> = {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        // No enviamos useVenueMap en el update — el backend no debe cambiar el modo
        // si ya existen boletos vendidos. La lógica de protección está en el backend.
      };

      if (editingEvent.useVenueMap) {
        // Auditorio ESCOM: siempre gratuito, el backend también lo fuerza a 0
        body.sectionPrices = sectionPrices.map(sp => ({
          sectionCode: sp.sectionCode,
          price: 0,
          currency: 'MXN',
        }));
      } else {
        // Modo clásico: actualizar ticket types
        // Incluimos el id cuando existe (actualizar) y lo omitimos cuando no (crear nuevo)
        body.ticketTypes = freeTicketTypes.map(tt => ({
          ...(tt.id ? { id: tt.id } : {}),
          name: tt.name.trim(),
          description: tt.description.trim() || undefined,
          price: tt.price,
          currency: 'MXN',
          capacity: parseInt(tt.capacity, 10),
        }));
      }

      const res = await fetch(`${API_BASE_URL}/events/${editingEvent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(Array.isArray(d.message) ? d.message.join('. ') : (d.message || 'Error al actualizar evento'));
      }

      closeForm();
      setSuccessMsg('Evento actualizado correctamente.');
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
      setSuccessMsg(
        updated.isPublished
          ? '🎉 Evento publicado. Se enviaron notificaciones push a los suscriptores.'
          : 'Evento despublicado.'
      );
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

  const formTitle = formMode === 'edit'
    ? `Editar: ${editingEvent?.title ?? ''}`
    : 'Nuevo evento';

  const isFormLoading = actionLoading === 'create' || actionLoading === 'update';
  const submitLabel = formMode === 'edit'
    ? (isFormLoading ? 'Guardando…' : 'Guardar cambios')
    : (isFormLoading ? 'Creando…' : 'Crear evento');

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
              <div className="header-actions">
                {'Notification' in window && (
                  <motion.button
                    className={`btn btn-notif ${pushEnabled ? 'notif-on' : 'notif-off'}`}
                    onClick={handleTogglePush}
                    disabled={pushLoading}
                    whileHover={{ y: -1 }}
                    whileTap={{ y: 0, scale: 0.97 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                    title={pushEnabled ? 'Desactivar notificaciones push' : 'Activar notificaciones push'}
                  >
                    {pushLoading ? (
                      <span className="notif-spinner" />
                    ) : pushEnabled ? (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                        <span className="notif-label">Notificaciones on</span>
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                        <span className="notif-label">Notificaciones</span>
                      </>
                    )}
                  </motion.button>
                )}
              <motion.button
                className="btn btn-primary"
                onClick={showForm ? closeForm : openCreateForm}
                whileHover={{ y: -1 }} whileTap={{ y: 0, scale: 0.97 }}
                transition={{ type: 'spring', damping: 20, stiffness: 400 }}
              >
                {showForm ? 'Cancelar' : '+ Nuevo evento'}
              </motion.button>
              </div>
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
                <h2 className="form-title">{formTitle}</h2>
                <form
                  className="create-form"
                  onSubmit={formMode === 'edit' ? handleUpdate : handleCreate}
                >

                  {/* ── Información general ── */}
                  <div className="form-section-title">Información general</div>

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
                      <input id="venueName" type="text" value={form.venueName} onChange={e => setForm({ ...form, venueName: e.target.value })} required placeholder="Auditorio ESCOM" />
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
<input
  id="endsAt"
  type="datetime-local"
  value={form.endsAt}
  min={form.startsAt || undefined}
  onChange={e => setForm({ ...form, endsAt: e.target.value })}
  required
/>
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

                  {/* ── Modo de boletos ── */}
                  <div className="form-divider" />
                  <div className="form-section-title">
                    Tipo de boletos
                    <span className="form-section-required">Requerido</span>
                  </div>

                  {/*
                    En modo edición, el toggle está deshabilitado para prevenir que el
                    organizador cambie de "mapa" a "libre" o viceversa, ya que eso
                    implicaría eliminar asientos/tipos de boleto con potencial de romper
                    reservas existentes. El backend no lo permite tampoco.
                  */}
                  <VenueModeToggle
                    useMap={useVenueMap}
                    onChange={setUseVenueMap}
                    disabled={formMode === 'edit'}
                  />

                  {/* ── Editor condicional ── */}
                  <AnimatePresence mode="wait">
                    {useVenueMap ? (
                      <motion.div
                        key="map-editor"
                        variants={slideVariants}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                      >
                        <SectionPriceEditor prices={sectionPrices} onChange={setSectionPrices} />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="free-editor"
                        variants={slideVariants}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                      >
                        <FreeTicketTypesEditor types={freeTicketTypes} onChange={setFreeTicketTypes} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ── Acciones ── */}
                  <div className="form-actions">
                    <button type="button" className="btn btn-ghost" onClick={closeForm}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={isFormLoading}>
                      {submitLabel}
                    </button>
                  </div>
                </form>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Lista de eventos */}
          {loading ? (
            <div className="events-grid">
              {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : !isOrganizer ? (
            <motion.div className="access-denied" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p>Tu cuenta tiene el rol <strong>{profile?.role ?? 'desconocido'}</strong> y no puede gestionar eventos.</p>
            </motion.div>
          ) : events.length === 0 ? (
            <EmptyState onCreateClick={openCreateForm} />
          ) : (
            <motion.div className="events-grid" variants={containerVariants} initial="hidden" animate="show">
              <AnimatePresence>
                {events.map(event => (
                  <motion.article
                    key={event.id}
                    className={`event-card ${event.isPublished ? 'is-published' : 'is-draft'} ${editingEvent?.id === event.id ? 'is-editing' : ''}`}
                    variants={cardVariants}
                    layout
                    whileHover={{ y: -3, boxShadow: '0 8px 32px oklch(0 0 0 / 0.22)', transition: { duration: 0.18 } }}
                  >
                    <div className="card-head">
                      <div className="card-head-top">
                        <StatusBadge published={event.isPublished} />
                        <div className="card-head-right">
                          {event.useVenueMap && (
                            <span className="map-badge" title="Usa el mapa del auditorio">🗺️ Mapa</span>
                          )}
                          <span className="card-id">#{event.id.slice(0, 6).toUpperCase()}</span>
                        </div>
                      </div>
                      <h2 className="card-title">{event.title}</h2>
                      {event.description && (
                        <p className="card-description">{event.description}</p>
                      )}
                    </div>
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
                    <div className="card-footer">
                      {/* ── Editar (siempre disponible, publicado o no) ── */}
                      <motion.button
                        className={`btn btn-secondary ${editingEvent?.id === event.id ? 'btn-editing' : ''}`}
                        onClick={() => editingEvent?.id === event.id ? closeForm() : openEditForm(event)}
                        disabled={!!actionLoading}
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                        title="Editar información del evento"
                      >
                        {editingEvent?.id === event.id ? '✕ Cerrar editor' : '✏️ Editar'}
                      </motion.button>

                      {/* ── Publicar / Despublicar ── */}
                      <motion.button
                        className={`btn ${event.isPublished ? 'btn-outline-danger' : 'btn-publish'}`}
                        onClick={() => togglePublish(event)}
                        disabled={actionLoading === event.id}
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                      >
                        {actionLoading === event.id ? 'Procesando…' : event.isPublished ? 'Despublicar' : 'Publicar'}
                      </motion.button>

                      {/* ── Gestionar boletos (modo clásico) ── */}
                      {!event.useVenueMap && (
                        <motion.button
                          className="btn btn-ghost"
                          onClick={() => router.push(`/events/${event.id}/ticket-types`)}
                          whileTap={{ scale: 0.96 }}
                          transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                        >
                          Gestionar boletos
                        </motion.button>
                      )}
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
  .form-section-title {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }
  .form-section-required {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: rgba(99,102,241,0.15);
    color: #818cf8;
    border: 1px solid rgba(99,102,241,0.25);
    border-radius: 9999px;
    padding: 1px 7px;
  }
  .form-divider {
    height: 1px;
    background: var(--border);
    margin: 0.25rem 0;
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

  /* ── Venue Mode Toggle ── */
  .venue-mode-toggle {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .venue-mode-title {
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  .venue-mode-locked {
    font-size: 0.75rem;
    color: var(--amber);
  }
  .venue-mode-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  .venue-mode-option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    background: var(--surface-2);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color var(--tr), background var(--tr), box-shadow var(--tr);
    text-align: left;
    width: 100%;
  }
  .venue-mode-option:hover:not(.locked) {
    border-color: rgba(99,102,241,0.3);
    background: var(--surface-3);
  }
  .venue-mode-option.active {
    border-color: var(--accent);
    background: var(--accent-dim);
    box-shadow: 0 0 0 1px rgba(99,102,241,0.15) inset;
  }
  .venue-mode-option.locked {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .vmo-icon {
    font-size: 1.4rem;
    flex-shrink: 0;
    line-height: 1;
  }
  .vmo-content {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex: 1;
    min-width: 0;
  }
  .vmo-label {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text);
    line-height: 1.2;
  }
  .vmo-desc {
    font-size: 0.72rem;
    color: var(--text-muted);
    line-height: 1.3;
  }
  .vmo-check {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--accent);
    flex-shrink: 0;
    background: rgba(99,102,241,0.15);
    border-radius: 9999px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Section Price Editor ── */
  .section-price-editor {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-top: 0.5rem;
  }
  .section-price-hint {
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  /* ── Aviso recinto académico ESCOM ── */
  .escom-free-notice {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    background: rgba(34,197,94,0.08);
    border: 1px solid rgba(34,197,94,0.22);
    border-radius: var(--radius);
    padding: 0.85rem 1rem;
    font-size: 0.83rem;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .escom-free-notice strong { color: var(--text); display: block; margin-bottom: 0.2rem; }
  .escom-free-notice p { margin: 0; }
  .escom-free-icon { font-size: 1.4rem; flex-shrink: 0; margin-top: 0.1rem; }

  /* ── Badge GRATIS en el mapa ── */
  .vm-free {
    font-size: 0.68rem !important;
    font-weight: 800 !important;
    letter-spacing: 0.06em;
    color: var(--green) !important;
    background: rgba(34,197,94,0.12);
    border: 1px solid rgba(34,197,94,0.25);
    border-radius: 9999px;
    padding: 1px 8px;
  }

  /* Mini-mapa del auditorio */
  .venue-map {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
  }
  .vm-stage {
    background: rgba(99,102,241,0.12);
    border: 1px solid rgba(99,102,241,0.25);
    border-radius: 8px;
    color: #818cf8;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-align: center;
    padding: 0.3rem 2rem;
    width: 55%;
  }
  .vm-sections {
    display: flex;
    gap: 0.4rem;
    width: 100%;
  }
  .vm-section {
    flex: 1;
    border-radius: 8px;
    padding: 0.5rem 0.4rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    border: 1px solid transparent;
  }
  .vm-ctr {
    background: rgba(79,152,163,0.12);
    border-color: rgba(79,152,163,0.25);
    flex: 1.8;
  }
  .vm-izq, .vm-der {
    background: rgba(126,179,188,0.08);
    border-color: rgba(126,179,188,0.18);
  }
  .vm-sec-label {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.03em;
  }
  .vm-sec-price {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .vm-audience {
    font-size: 0.65rem;
    color: var(--text-faint);
    letter-spacing: 0.05em;
  }

  /* Inputs de precio */
  .section-price-inputs {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .section-price-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.65rem 0.85rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transition: border-color var(--tr);
  }
  .section-price-row:focus-within {
    border-color: rgba(99,102,241,0.35);
  }
  .section-price-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
    flex-shrink: 0;
  }
  .section-dot {
    width: 10px;
    height: 10px;
    border-radius: 9999px;
    flex-shrink: 0;
  }
  .section-code {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--text-faint);
    letter-spacing: 0.04em;
  }
  .section-price-input-wrap {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .price-currency {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-faint);
    white-space: nowrap;
  }
  .price-input {
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    color: var(--text);
    font-family: var(--font);
    font-size: 0.95rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 0.2rem 0.3rem;
    width: 110px;
    text-align: right;
    transition: border-color var(--tr);
  }
  .price-input:focus {
    outline: none;
    border-bottom-color: var(--accent);
  }
  .price-input::placeholder { color: var(--text-faint); font-weight: 400; }
  .price-input::-webkit-outer-spin-button,
  .price-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .price-input[type=number] { -moz-appearance: textfield; }

  /* ── Free Ticket Types Editor ── */
  .free-ticket-editor {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-top: 0.5rem;
  }
  .ticket-types-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .ticket-type-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition: border-color var(--tr);
  }
  .ticket-type-card:focus-within {
    border-color: rgba(99,102,241,0.3);
  }
  .ticket-type-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ticket-type-num {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-faint);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .ticket-type-existing {
    color: #4f98a3;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
  }
  .ticket-type-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-faint);
    font-size: 0.85rem;
    padding: 2px 6px;
    border-radius: 6px;
    transition: background var(--tr), color var(--tr);
  }
  .ticket-type-remove:hover {
    background: var(--red-dim);
    color: var(--red);
  }
  .btn-add-type {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    border-radius: var(--radius);
    font-family: var(--font);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    background: transparent;
    border: 1px dashed rgba(99,102,241,0.35);
    color: #818cf8;
    transition: background var(--tr), border-color var(--tr), color var(--tr);
    width: 100%;
    justify-content: center;
  }
  .btn-add-type:hover {
    background: var(--accent-dim);
    border-color: rgba(99,102,241,0.55);
    color: var(--accent);
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
  .event-card.is-editing { border-color: rgba(99,102,241,0.5); box-shadow: 0 0 0 2px rgba(99,102,241,0.12); }
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
  .card-head-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .map-badge {
    font-size: 0.68rem;
    font-weight: 600;
    color: #4f98a3;
    background: rgba(79,152,163,0.1);
    border: 1px solid rgba(79,152,163,0.22);
    border-radius: 9999px;
    padding: 1px 7px;
    white-space: nowrap;
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
  .btn-editing { background: var(--accent-dim); color: #818cf8; border-color: rgba(99,102,241,0.3); }
  .btn-ghost { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
  .btn-ghost:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
  .btn-publish { background: var(--green-dim); color: var(--green); border: 1px solid var(--green-border); }
  .btn-publish:hover:not(:disabled) { background: rgba(34,197,94,0.2); }
  .btn-outline-danger { background: var(--red-dim); color: var(--red); border: 1px solid var(--red-border); }
  .btn-outline-danger:hover:not(:disabled) { background: rgba(239,68,68,0.2); }

  /* ── Notification button ── */
  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .btn-notif {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.8rem;
    padding: 0.45rem 0.85rem;
    gap: 0.35rem;
  }
  .btn-notif:hover:not(:disabled) { background: var(--surface-3); color: var(--text); }
  .btn-notif.notif-on {
    background: rgba(34,197,94,0.1);
    border-color: rgba(34,197,94,0.28);
    color: var(--green);
  }
  .btn-notif.notif-on:hover:not(:disabled) { background: rgba(34,197,94,0.18); }
  .notif-label { display: none; }
  @media (min-width: 480px) { .notif-label { display: inline; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .notif-spinner {
    width: 13px; height: 13px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    display: inline-block;
    animation: spin 0.7s linear infinite;
  }

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
    .venue-mode-options { grid-template-columns: 1fr; }
    .events-grid { grid-template-columns: 1fr; }
    .card-footer { flex-direction: column; }
    .card-footer .btn { width: 100%; }
    .section-price-row { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
    .price-input { width: 100%; }
  }
`;
