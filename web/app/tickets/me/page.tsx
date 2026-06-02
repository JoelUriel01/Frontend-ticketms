'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { API_BASE_URL } from '@/lib/supabase/api';
import { useEnsurePublicKey } from '@/lib/useEnsurePublicKey';


// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

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
  seatLabel?: string;
  seatSection?: string;
  seatRow?: string;
  seatNumber?: number;
  event?: {
    id: string;
    title: string;
    venueName: string;
    venueCity: string;
    startsAt: string;
    endsAt: string;   // ← para saber si el evento ya terminó
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
  endsAt: string;     // ← para saber si el evento ya terminó
  tickets: Ticket[];
  color: string;
  abbr: string;
}

// ─────────────────────────────────────────────────────────────
// ECDSA CLIENT — genera claves y firma payloads en el navegador
// La clave privada NUNCA sale del dispositivo.
// ─────────────────────────────────────────────────────────────

const ECDSA_KEY_STORE = 'ticketapp-ecdsa-keypair';
const PUBKEY_REGISTERED_STORE = 'ticketapp-pubkey-registered';


async function ensureKeyPair(
  token: string,
  apiBase: string,
): Promise<{ publicKey: string }> {
  // Genera o recupera el keypair local
  const stored = localStorage.getItem(ECDSA_KEY_STORE);
  const { publicKey } = stored
    ? JSON.parse(stored)
    : await generateAndStoreKeyPair();

  // Siempre intenta registrar — el servidor debe ser idempotente (upsert)
  // Si ya está registrada con la misma key, el servidor simplemente responde OK
  try {
    await fetch(`${apiBase}/users/me/public-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ publicKey }),
    });
  } catch {
    // No bloquear si hay error de red — el 422 posterior lo manejará
  }

  return { publicKey };
}

async function generateAndStoreKeyPair(): Promise<{ publicKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const privPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const publicKey = bufToB64(pubRaw);
  const privateKey = bufToB64(privPkcs8);
  localStorage.setItem(ECDSA_KEY_STORE, JSON.stringify({ publicKey, privateKey }));
  return { publicKey };
}

async function signPayload(payloadObj: Record<string, string>): Promise<string> {
  const stored = localStorage.getItem(ECDSA_KEY_STORE);
  if (!stored) throw new Error('No hay claves registradas en este dispositivo.');
  const { privateKey: privB64 } = JSON.parse(stored);
  
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    b64ToBuf(privB64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  
  const payloadStr = JSON.stringify(payloadObj);
  
  // ✅ CORRECTO: pasar los bytes del string directamente.
  // crypto.subtle.sign con hash:'SHA-256' hashea internamente.
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(payloadStr),  // ← string crudo, NO pre-hasheado
  );
  
  return bufToB64(sigBuf);
}

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
function uuid(): string {
  return crypto.randomUUID();
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
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
function isEventOver(endsAt: string) {
  if (!endsAt) return false;
  return new Date(endsAt).getTime() < Date.now();
}
function groupTicketsByEvent(tickets: Ticket[]): EventGroup[] {
  const map = new Map<string, EventGroup>();
  for (const t of tickets) {
    const key = t.eventId;
    const title = t.event?.title ?? 'Evento';
    if (!map.has(key)) {
      map.set(key, {
        eventId: key, title,
        venueName: t.event?.venueName ?? '—',
        venueCity: t.event?.venueCity ?? '—',
        startsAt: t.event?.startsAt ?? '',
        endsAt: t.event?.endsAt ?? '',
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

// ─────────────────────────────────────────────────────────────
// MODAL DE TRANSFERENCIA
// ─────────────────────────────────────────────────────────────

type TransferStep = 'form' | 'signing' | 'success' | 'error';

interface TransferModalProps {
  ticket: Ticket;
  token: string;
  currentUserId: string;
  onClose: () => void;
}

function TransferModal({ ticket, token, currentUserId, onClose }: TransferModalProps) {
  const [step, setStep] = useState<TransferStep>('form');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [createdTransferId, setCreatedTransferId] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Fade-in overlay
  useEffect(() => {
    if (typeof window === 'undefined') return;
    import('gsap').then(({ gsap }) => {
      if (overlayRef.current) {
        gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
        gsap.fromTo(
          overlayRef.current.querySelector('.transfer-modal'),
          { opacity: 0, y: 24, scale: 0.97 },
          { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power3.out' },
        );
      }
    });
  }, []);

async function handleSubmit() {
  if (!recipientEmail.trim()) return;
  setStep('signing');
  setErrorMsg('');

  // Intenta el envío; si falla por firma inválida, regenera keys y reintenta una vez
  async function attemptTransfer(isRetry = false): Promise<void> {
    // Si es reintento, limpiar keys para forzar regeneración
    if (isRetry) {
      localStorage.removeItem(ECDSA_KEY_STORE);
      localStorage.removeItem('ticketapp-pubkey-registered');
    }

    // 1. Asegurar keypair y registrar public key en el servidor
    await ensureKeyPair(token, API_BASE_URL);

    // 2. Resolver email → userId del receptor
    const recipientRes = await fetch(
      `${API_BASE_URL}/users/by-email/${encodeURIComponent(recipientEmail.trim())}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!recipientRes.ok) {
      throw new Error('No se encontró un usuario con ese correo.');
    }
    const recipient = await recipientRes.json();

    // 3. Construir payload y firmarlo con la clave actual
    const nonce = uuid();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const payloadObj = {
      ticketId: ticket.id,
      senderId: currentUserId,
      recipientId: recipient.id,
      expiresAt,
      nonce,
    };
    const signature = await signPayload(payloadObj);

    // 4. Enviar al servidor
    const transferRes = await fetch(`${API_BASE_URL}/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ticketId: ticket.id,
        recipientId: recipient.id,
        expiresAt,
        nonce,
        signature,
      }),
    });

    if (!transferRes.ok) {
      const body = await transferRes.json().catch(() => ({}));
      const msg: string = body.message ?? '';

      // Si el servidor dice que la firma es inválida Y no es ya un reintento,
      // regenerar keys automáticamente y reintentar UNA sola vez
      if (!isRetry && (transferRes.status === 422 || msg.toLowerCase().includes('ecdsa'))) {
        return attemptTransfer(true); // 🔄 auto-recovery
      }

      throw new Error(msg || 'Error al crear la transferencia.');
    }

    const transfer = await transferRes.json();
    setCreatedTransferId(transfer.id);
    setStep('success');
  }

  try {
    await attemptTransfer();
  } catch (e: any) {
    setErrorMsg(e.message ?? 'Ocurrió un error inesperado.');
    setStep('error');
  }
}

  const shortId = ticket.id.slice(0, 8).toUpperCase();

  return (
    <div ref={overlayRef} className="modal-overlay" onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="transfer-modal">

        {/* Header */}
        <div className="tm-header">
          <div className="tm-header-left">
            <div className="tm-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
            <div>
              <p className="tm-title">Transferir boleto</p>
              <p className="tm-subtitle">#{shortId}</p>
            </div>
          </div>
          <button className="tm-close" onClick={onClose} aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Ticket info pill */}
        <div className="tm-ticket-pill">
          <span className="tm-ticket-event">{ticket.event?.title ?? 'Evento'}</span>
          {ticket.seatLabel && <span className="tm-ticket-seat">{ticket.seatLabel}</span>}
          <StatusPill status={ticket.status} />
        </div>

        {/* Contenido según paso */}
        {step === 'form' && (
          <div className="tm-body">
            <p className="tm-desc">
              Ingresa el correo de la persona a quien quieres transferir este boleto.
              Tendrá 48 horas para aceptarlo.
            </p>
            <label className="tm-label">Correo del receptor</label>
            <input
              className="tm-input"
              type="email"
              placeholder="correo@ejemplo.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              autoFocus
            />
            <div className="tm-security-note">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              La transferencia se firma criptográficamente con tu clave privada. Nadie puede falsificarla.
            </div>
            <div className="tm-actions">
              <button className="tm-btn-cancel" onClick={onClose}>Cancelar</button>
              <button
                className="tm-btn-primary"
                onClick={handleSubmit}
                disabled={!recipientEmail.trim()}
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {step === 'signing' && (
          <div className="tm-body tm-center">
            <div className="tm-signing-anim">
              <div className="signing-ring" />
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <p className="tm-signing-title">Firmando transferencia</p>
            <p className="tm-signing-sub">Generando firma ECDSA en tu dispositivo…</p>
          </div>
        )}

        {step === 'success' && (
          <div className="tm-body tm-center">
            <div className="tm-success-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <p className="tm-signing-title">¡Transferencia enviada!</p>
            <p className="tm-signing-sub">
              Le enviamos una notificación a <strong>{recipientEmail}</strong>.
              Tiene 48 horas para aceptar.
            </p>
            {createdTransferId && (
              <p className="tm-transfer-id">ID: {createdTransferId.slice(0, 16).toUpperCase()}</p>
            )}
            <button className="tm-btn-primary" style={{ marginTop: 20 }} onClick={onClose}>
              Listo
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="tm-body tm-center">
            <div className="tm-error-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <p className="tm-signing-title">Algo salió mal</p>
            <p className="tm-signing-sub">{errorMsg}</p>
            <div className="tm-actions" style={{ marginTop: 20 }}>
              <button className="tm-btn-cancel" onClick={onClose}>Cerrar</button>
              <button className="tm-btn-primary" onClick={() => { setStep('form'); setErrorMsg(''); }}>
                Intentar de nuevo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL DE CANCELACIÓN DE TRANSFERENCIA
// ─────────────────────────────────────────────────────────────

type CancelStep = 'confirm' | 'canceling' | 'success' | 'error';

interface CancelTransferModalProps {
  transferId: string;
  ticket: Ticket;
  token: string;
  onClose: () => void;
  onCanceled: () => void;
}

function CancelTransferModal({ transferId, ticket, token, onClose, onCanceled }: CancelTransferModalProps) {
  const [step, setStep] = useState<CancelStep>('confirm');
  const [errorMsg, setErrorMsg] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    import('gsap').then(({ gsap }) => {
      if (overlayRef.current) {
        gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
        gsap.fromTo(
          overlayRef.current.querySelector('.transfer-modal'),
          { opacity: 0, y: 24, scale: 0.97 },
          { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power3.out' },
        );
      }
    });
  }, []);

  async function handleConfirm() {
    setStep('canceling');
    try {
      const res = await fetch(`${API_BASE_URL}/transfers/${transferId}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'No se pudo cancelar la transferencia.');
      }
      setStep('success');
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Ocurrió un error inesperado.');
      setStep('error');
    }
  }

  const shortId = ticket.id.slice(0, 8).toUpperCase();

  return (
    <div ref={overlayRef} className="modal-overlay" onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="transfer-modal">

        {/* Header */}
        <div className="tm-header">
          <div className="tm-header-left">
            <div className="tm-icon" style={{ color: '#f87171', background: 'rgba(239,68,68,.12)', borderColor: 'rgba(239,68,68,.2)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
            <div>
              <p className="tm-title">Cancelar transferencia</p>
              <p className="tm-subtitle">#{shortId}</p>
            </div>
          </div>
          <button className="tm-close" onClick={onClose} aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Ticket info pill */}
        <div className="tm-ticket-pill">
          <span className="tm-ticket-event">{ticket.event?.title ?? 'Evento'}</span>
          {ticket.seatLabel && <span className="tm-ticket-seat">{ticket.seatLabel}</span>}
          <StatusPill status={ticket.status} />
        </div>

        {step === 'confirm' && (
          <div className="tm-body">
            <p className="tm-desc">
              ¿Estás seguro de que deseas cancelar esta transferencia?
              El boleto regresará a tu cuenta como <strong>activo</strong> y el receptor ya no podrá aceptarla.
            </p>
            <div className="tm-security-note" style={{ background: 'rgba(239,68,68,.06)', borderColor: 'rgba(239,68,68,.15)', color: '#f87171' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
              Esta acción revocará la firma ECDSA enviada al receptor.
            </div>
            <div className="tm-actions">
              <button className="tm-btn-cancel" onClick={onClose}>Volver</button>
              <button
                className="tm-btn-primary"
                style={{ background: 'rgba(239,68,68,.85)', borderColor: 'rgba(239,68,68,.5)' }}
                onClick={handleConfirm}
              >
                Sí, cancelar
              </button>
            </div>
          </div>
        )}

        {step === 'canceling' && (
          <div className="tm-body tm-center">
            <div className="tm-signing-anim">
              <div className="signing-ring" style={{ borderTopColor: '#ef4444' }} />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
            <p className="tm-signing-title">Cancelando…</p>
            <p className="tm-signing-sub">Revirtiendo la transferencia pendiente.</p>
          </div>
        )}

        {step === 'success' && (
          <div className="tm-body tm-center">
            <div className="tm-success-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <p className="tm-signing-title">Transferencia cancelada</p>
            <p className="tm-signing-sub">El boleto volvió a tu cuenta y está de nuevo <strong>activo</strong>.</p>
            <button className="tm-btn-primary" style={{ marginTop: 20 }} onClick={onCanceled}>
              Listo
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="tm-body tm-center">
            <div className="tm-error-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <p className="tm-signing-title">Algo salió mal</p>
            <p className="tm-signing-sub">{errorMsg}</p>
            <div className="tm-actions" style={{ marginTop: 20 }}>
              <button className="tm-btn-cancel" onClick={onClose}>Cerrar</button>
              <button className="tm-btn-primary" onClick={() => { setStep('confirm'); setErrorMsg(''); }}>
                Intentar de nuevo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TICKET ROW — con botón de transferir
// ─────────────────────────────────────────────────────────────

interface TicketRowProps {
  ticket: Ticket;
  onTransfer: (ticket: Ticket) => void;
  onCancelTransfer?: () => void;
  eventOver?: boolean;
}

function TicketRow({ ticket, onTransfer, onCancelTransfer, eventOver = false }: TicketRowProps) {
  const shortId = ticket.id.slice(0, 8).toUpperCase();
  const canTransfer = (ticket.status ?? '').toLowerCase() === 'active' && !eventOver;
  const canCancel = (ticket.status ?? '').toLowerCase() === 'transfer_pending' && !!onCancelTransfer && !eventOver;

  return (
    <div className="ticket-row-item">
      <Link href={`/tickets/${ticket.id}`} className="ticket-row-link">
        <div className="ticket-row-left">
          <span className="ticket-code">#{shortId}</span>
          {ticket.seatLabel && (
            <span className="ticket-seat-label">{ticket.seatLabel}</span>
          )}
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

      {canTransfer && (
        <button
          className="transfer-btn"
          onClick={() => onTransfer(ticket)}
          title="Transferir este boleto"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <span>Transferir</span>
        </button>
      )}

      {canCancel && (
        <button
          className="cancel-transfer-btn"
          onClick={onCancelTransfer}
          title="Cancelar transferencia pendiente"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" />
          </svg>
          <span>Cancelar</span>
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EVENT CARD
// ─────────────────────────────────────────────────────────────

interface EventCardProps {
  group: EventGroup;
  index: number;
  onTransfer: (ticket: Ticket) => void;
  onCancelTransfer: (transferId: string, ticket: Ticket) => void;
  pendingTransferMap: Record<string, string>;
}

function EventCard({ group, index, onTransfer, onCancelTransfer, pendingTransferMap }: EventCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    import('gsap').then(({ gsap }) => {
      if (cardRef.current) {
        gsap.fromTo(
          cardRef.current,
          { opacity: 0, y: 40, scale: 0.97 },
          { opacity: 1, y: 0, scale: 1, duration: 0.6, delay: index * 0.1, ease: 'power3.out' },
        );
      }
    });
  }, [index]);

  const over = isEventOver(group.endsAt);
  const totalCost = group.tickets.reduce((sum, t) => sum + Number(t.price), 0);
  const activeCount = group.tickets.filter((t) => (t.status ?? '').toLowerCase() === 'active').length;

  return (
    <div ref={cardRef} className="event-card" style={{ '--accent-color': group.color } as React.CSSProperties}>
      <div className="event-card-header" onClick={() => setExpanded((v) => !v)}>
        <div className="event-header-left">
          <div className="event-avatar" style={{ background: over ? '#52525b' : group.color }}>{group.abbr}</div>
          <div className="event-meta">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 className="event-title">{group.title}</h2>
              {over && (
                <span style={{
                  fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em',
                  padding: '2px 7px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.07)', color: '#71717a',
                  whiteSpace: 'nowrap',
                }}>
                  FINALIZADO
                </span>
              )}
            </div>
            {group.startsAt && (
              <p className="event-datetime">{fmtDate(group.startsAt)} · {fmtTime(group.startsAt)}</p>
            )}
            <p className="event-venue">
              {group.venueName}{group.venueCity ? `, ${group.venueCity}` : ''}
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
            width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="event-card-body">
          <div className="tickets-list">
            {group.tickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                onTransfer={onTransfer}
                eventOver={over}
                onCancelTransfer={
                  pendingTransferMap[ticket.id]
                    ? () => onCancelTransfer(pendingTransferMap[ticket.id], ticket)
                    : undefined
                }
              />
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

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [transferTicket, setTransferTicket] = useState<Ticket | null>(null);
  const [pendingTransferMap, setPendingTransferMap] = useState<Record<string, string>>({});
  const [cancelInfo, setCancelInfo] = useState<{ transferId: string; ticket: Ticket } | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEnsurePublicKey(token || null);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    import('gsap').then(({ gsap }) => {
      if (headerRef.current) {
        gsap.fromTo(
          headerRef.current.querySelectorAll('.anim-header > *'),
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, stagger: 0.12, duration: 0.7, ease: 'power3.out' },
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

        setToken(session.access_token);
        setCurrentUserId(session.user.id);

        const [ticketsRes, transfersRes] = await Promise.all([
          fetch(`${API_BASE_URL}/tickets/me`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
          fetch(`${API_BASE_URL}/transfers/outgoing`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
        ]);

        if (!ticketsRes.ok) {
          const body = await ticketsRes.json().catch(() => ({}));
          throw new Error(body.message || 'No se pudieron cargar tus boletos');
        }
        const data = await ticketsRes.json();
        setTickets(Array.isArray(data) ? data : []);

        if (transfersRes.ok) {
          const outgoing = await transfersRes.json().catch(() => []);
          const map: Record<string, string> = {};
          for (const t of Array.isArray(outgoing) ? outgoing : []) {
            if (t.status === 'PENDING') map[t.ticketId] = t.id;
          }
          setPendingTransferMap(map);
        }
      } catch (e: any) {
        setError(e.message ?? 'Ocurrió un error al cargar tus boletos.');
      } finally {
        setLoading(false);
      }
    }
    loadTickets();
  }, []);

  const refreshData = useCallback((accessToken: string) => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE_URL}/tickets/me`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch(`${API_BASE_URL}/transfers/outgoing`, { headers: { Authorization: `Bearer ${accessToken}` } }),
    ])
      .then(async ([ticketsRes, transfersRes]) => {
        if (ticketsRes.ok) {
          const data = await ticketsRes.json().catch(() => []);
          setTickets(Array.isArray(data) ? data : []);
        }
        if (transfersRes.ok) {
          const outgoing = await transfersRes.json().catch(() => []);
          const map: Record<string, string> = {};
          for (const t of Array.isArray(outgoing) ? outgoing : []) {
            if (t.status === 'PENDING') map[t.ticketId] = t.id;
          }
          setPendingTransferMap(map);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleTransferComplete = useCallback(() => {
    setTransferTicket(null);
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      refreshData(session.access_token);
    });
  }, [refreshData]);

  const handleCancelComplete = useCallback(() => {
    setCancelInfo(null);
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      refreshData(session.access_token);
    });
  }, [refreshData]);

  const groups = groupTicketsByEvent(tickets);
  const totalTickets = tickets.length;
  const totalEvents = groups.length;
  const activeTickets = tickets.filter((t) => (t.status ?? '').toLowerCase() === 'active').length;
  // Solo cuenta como transferibles los boletos activos de eventos que AÚN no han terminado
  const transferableTickets = tickets.filter((t) =>
    (t.status ?? '').toLowerCase() === 'active' && !isEventOver(t.event?.endsAt ?? ''),
  ).length;

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
                      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" />
                    </svg>
                    {totalEvents} {totalEvents === 1 ? 'evento' : 'eventos'}
                  </span>
                  <span className="summary-pill">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V9z" />
                    </svg>
                    {totalTickets} {totalTickets === 1 ? 'boleto' : 'boletos'}
                  </span>
                  {transferableTickets > 0 && (
                    <span className="summary-pill summary-pill-active">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                      {transferableTickets} transferibles
                    </span>
                  )}
                </div>
              )}
            </div>
          </header>

          {loading ? (
            <div className="loading-state"><div className="spinner" /></div>
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
                <EventCard
                  key={group.eventId}
                  group={group}
                  index={i}
                  onTransfer={setTransferTicket}
                  onCancelTransfer={(transferId, ticket) => setCancelInfo({ transferId, ticket })}
                  pendingTransferMap={pendingTransferMap}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Modal de transferencia — se monta solo cuando hay un boleto seleccionado */}
      {transferTicket && token && currentUserId && (
        <TransferModal
          ticket={transferTicket}
          token={token}
          currentUserId={currentUserId}
          onClose={handleTransferComplete}
        />
      )}

      {/* Modal de cancelación — se monta cuando el usuario quiere cancelar una transferencia pendiente */}
      {cancelInfo && token && (
        <CancelTransferModal
          transferId={cancelInfo.transferId}
          ticket={cancelInfo.ticket}
          token={token}
          onClose={() => setCancelInfo(null)}
          onCanceled={handleCancelComplete}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────

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

.page-root {
  min-height: 100vh;
  background:
    radial-gradient(ellipse 80% 40% at 50% -10%, rgba(124,58,237,.12), transparent),
    linear-gradient(180deg, #050507 0%, #08080c 100%);
}

/* ── Nav ── */
.top-nav {
  position: sticky; top: 0; z-index: 20;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  background: rgba(5,5,7,.75);
  border-bottom: 1px solid var(--border-subtle);
}
.nav-inner {
  max-width: 760px; margin: 0 auto; padding: 16px 24px;
  display: flex; align-items: center; justify-content: space-between;
}
.back-btn {
  display: inline-flex; align-items: center; gap: 7px;
  color: var(--muted); font-size: 14px; transition: color .2s;
}
.back-btn:hover { color: var(--text); }
.nav-title { font-size: 14px; color: #c4c4d0; font-weight: 600; }

/* ── Layout ── */
.tickets-layout { max-width: 760px; margin: 0 auto; padding: 40px 24px 100px; }
.tickets-header { margin-bottom: 36px; }
.tickets-title { font-size: 42px; font-weight: 800; letter-spacing: -.04em; line-height: 1; }
.tickets-subtitle { margin-top: 10px; color: var(--muted); font-size: 15px; }
.summary-pills { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
.summary-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 500;
  color: #c4c4d0; background: rgba(255,255,255,.05); border: 1px solid var(--border);
}
.summary-pill-active {
  color: #a78bfa;
  background: rgba(124,58,237,.08);
  border-color: rgba(124,58,237,.25);
}

/* ── States ── */
.loading-state, .error-state, .empty-state {
  min-height: 52vh; display: flex; flex-direction: column;
  align-items: center; justify-content: center; text-align: center; gap: 10px;
}
.spinner {
  width: 40px; height: 40px; border-radius: 999px;
  border: 3px solid rgba(255,255,255,.07); border-top-color: var(--accent);
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.empty-icon {
  width: 64px; height: 64px; border-radius: 20px;
  display: grid; place-items: center; color: var(--muted);
  border: 1px solid var(--border); background: var(--panel); margin-bottom: 8px;
}
.empty-state h2 { font-size: 28px; letter-spacing: -.03em; }
.empty-state p, .error-state p { color: var(--muted); font-size: 15px; }
.action-btn {
  margin-top: 8px; display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 22px; border-radius: 999px; border: 1px solid rgba(124,58,237,.4);
  font-size: 14px; color: #d8b4fe; transition: background .2s, border-color .2s;
}
.action-btn:hover { background: rgba(124,58,237,.12); border-color: rgba(124,58,237,.7); }

/* ── Events list ── */
.events-list { display: flex; flex-direction: column; gap: 16px; }

/* ── Event card ── */
.event-card {
  border-radius: 20px; border: 1px solid var(--border);
  background: var(--panel); overflow: hidden; opacity: 0;
  transition: border-color .25s;
}
.event-card:hover { border-color: rgba(124,58,237,.25); }
.event-card-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 20px 22px; cursor: pointer; user-select: none;
  transition: background .2s;
}
.event-card-header:hover { background: rgba(255,255,255,.02); }
.event-header-left { display: flex; align-items: center; gap: 16px; min-width: 0; flex: 1; }
.event-avatar {
  width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0;
  display: grid; place-items: center; font-size: 17px; font-weight: 800;
  color: #fff; letter-spacing: -.02em; box-shadow: inset 0 -6px 14px rgba(0,0,0,.2);
}
.event-meta { min-width: 0; }
.event-title {
  font-size: 18px; font-weight: 700; letter-spacing: -.025em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.event-datetime { margin-top: 4px; font-size: 13px; color: var(--muted); text-transform: capitalize; }
.event-venue { margin-top: 2px; font-size: 12px; color: var(--soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.event-header-right { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
.event-stats { display: flex; gap: 8px; }
.stat-chip {
  display: flex; flex-direction: column; align-items: center;
  padding: 7px 14px; border-radius: 10px;
  background: rgba(255,255,255,.04); border: 1px solid var(--border); min-width: 52px;
}
.stat-chip.stat-active { background: rgba(34,197,94,.08); border-color: rgba(34,197,94,.2); }
.stat-num { font-size: 17px; font-weight: 800; line-height: 1; letter-spacing: -.03em; }
.stat-active .stat-num { color: #86efac; }
.stat-label { font-size: 10px; color: var(--soft); margin-top: 2px; font-weight: 500; text-transform: uppercase; letter-spacing: .05em; }
.chevron-icon { color: var(--soft); transition: transform .3s ease; flex-shrink: 0; }
.chevron-open { transform: rotate(180deg); }

/* ── Card body ── */
.event-card-body { border-top: 1px solid var(--border); animation: slideDown .25s ease; }
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Ticket rows ── */
.tickets-list { padding: 6px 0; }
.ticket-row-item {
  display: flex; align-items: center;
  border-bottom: 1px solid rgba(255,255,255,.03);
  transition: background .15s;
}
.ticket-row-item:last-child { border-bottom: none; }
.ticket-row-item:hover { background: rgba(255,255,255,.025); }

.ticket-row-link {
  flex: 1; display: flex; align-items: center; justify-content: space-between;
  padding: 13px 22px; cursor: pointer;
}
.ticket-row-left { display: flex; align-items: center; gap: 10px; }
.ticket-code { font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace; font-size: 13px; color: #c0c0d0; letter-spacing: .04em; }
.ticket-seat-label { font-size: 12px; color: var(--muted); }
.ticket-row-right { display: flex; align-items: center; gap: 10px; }
.ticket-price { font-size: 14px; font-weight: 600; color: var(--text); }
.ticket-arrow { color: var(--soft); }

/* ── Botón transferir ── */
.transfer-btn {
  display: inline-flex; align-items: center; gap: 5px;
  margin-right: 14px; padding: 6px 12px; border-radius: 8px;
  font-size: 12px; font-weight: 600; color: #a78bfa;
  background: rgba(124,58,237,.1); border: 1px solid rgba(124,58,237,.25);
  cursor: pointer; transition: background .2s, border-color .2s; white-space: nowrap;
  flex-shrink: 0;
}
.transfer-btn:hover { background: rgba(124,58,237,.2); border-color: rgba(124,58,237,.5); }

/* ── Botón cancelar transferencia ── */
.cancel-transfer-btn {
  display: inline-flex; align-items: center; gap: 5px;
  margin-right: 14px; padding: 6px 12px; border-radius: 8px;
  font-size: 12px; font-weight: 600; color: #f87171;
  background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.2);
  cursor: pointer; transition: background .2s, border-color .2s; white-space: nowrap;
  flex-shrink: 0;
}
.cancel-transfer-btn:hover { background: rgba(239,68,68,.16); border-color: rgba(239,68,68,.45); }

/* ── Status pills ── */
.status-pill {
  display: inline-flex; align-items: center; padding: 3px 10px;
  border-radius: 999px; font-size: 10px; font-weight: 700;
  letter-spacing: .08em; text-transform: uppercase;
}
.status-active           { color: #86efac; background: rgba(34,197,94,.1);   border: 1px solid rgba(34,197,94,.2); }
.status-used             { color: #93c5fd; background: rgba(59,130,246,.1);  border: 1px solid rgba(59,130,246,.2); }
.status-revoked          { color: #fca5a5; background: rgba(239,68,68,.1);   border: 1px solid rgba(239,68,68,.2); }
.status-transfer_pending { color: #fbbf24; background: rgba(245,158,11,.1);  border: 1px solid rgba(245,158,11,.2); }
.status-transferred      { color: #c4b5fd; background: rgba(124,58,237,.1);  border: 1px solid rgba(124,58,237,.2); }

/* ── Footer ── */
.event-card-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 22px; border-top: 1px solid var(--border); background: rgba(255,255,255,.018);
}
.footer-label { font-size: 13px; color: var(--muted); }
.footer-total { font-size: 15px; font-weight: 700; color: var(--text); }

/* ═══════════════════════════════════════════════
   MODAL DE TRANSFERENCIA
   ═══════════════════════════════════════════════ */
.modal-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(5,5,7,.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}

.transfer-modal {
  width: 100%; max-width: 440px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 22px;
  overflow: hidden;
}

.tm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border);
}
.tm-header-left { display: flex; align-items: center; gap: 12px; }
.tm-icon {
  width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
  display: grid; place-items: center; color: #a78bfa;
  background: rgba(124,58,237,.12); border: 1px solid rgba(124,58,237,.2);
}
.tm-title { font-size: 15px; font-weight: 700; letter-spacing: -.02em; }
.tm-subtitle { font-size: 12px; color: var(--muted); font-family: 'JetBrains Mono', ui-monospace, monospace; margin-top: 1px; }
.tm-close {
  width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border);
  background: transparent; color: var(--muted); cursor: pointer;
  display: grid; place-items: center; transition: background .2s, color .2s;
}
.tm-close:hover { background: rgba(255,255,255,.05); color: var(--text); }

.tm-ticket-pill {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 20px;
  background: rgba(255,255,255,.025);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.tm-ticket-event { font-weight: 600; color: var(--text); }
.tm-ticket-seat { color: var(--muted); font-size: 12px; }

.tm-body { padding: 22px 20px 20px; }
.tm-center { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 30px 20px; }

.tm-desc { font-size: 14px; color: var(--muted); line-height: 1.6; margin-bottom: 18px; }

.tm-label { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .07em; display: block; margin-bottom: 8px; }

.tm-input {
  width: 100%; padding: 12px 14px;
  background: rgba(255,255,255,.04); border: 1px solid var(--border);
  border-radius: 12px; color: var(--text); font-size: 15px;
  font-family: inherit; outline: none;
  transition: border-color .2s;
}
.tm-input::placeholder { color: var(--soft); }
.tm-input:focus { border-color: rgba(124,58,237,.5); }

.tm-security-note {
  display: flex; align-items: flex-start; gap: 8px;
  margin-top: 14px; padding: 10px 14px;
  background: rgba(124,58,237,.07); border: 1px solid rgba(124,58,237,.15);
  border-radius: 10px; font-size: 12px; color: #a78bfa; line-height: 1.5;
}

.tm-actions {
  display: flex; gap: 10px; margin-top: 20px;
}
.tm-btn-cancel {
  flex: 1; padding: 11px; border-radius: 12px; font-size: 14px; font-weight: 600;
  background: transparent; border: 1px solid var(--border); color: var(--muted);
  cursor: pointer; transition: background .2s, color .2s; font-family: inherit;
}
.tm-btn-cancel:hover { background: rgba(255,255,255,.04); color: var(--text); }
.tm-btn-primary {
  flex: 1; padding: 11px; border-radius: 12px; font-size: 14px; font-weight: 600;
  background: rgba(124,58,237,.9); border: 1px solid rgba(124,58,237,.6); color: #fff;
  cursor: pointer; transition: background .2s, opacity .2s; font-family: inherit;
}
.tm-btn-primary:hover { background: rgba(124,58,237,1); }
.tm-btn-primary:disabled { opacity: .45; cursor: not-allowed; }

/* Signing animation */
.tm-signing-anim {
  width: 62px; height: 62px; position: relative;
  display: grid; place-items: center; color: #a78bfa; margin-bottom: 8px;
}
.signing-ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid rgba(124,58,237,.2);
  border-top-color: #7c3aed;
  animation: spin .9s linear infinite;
}
.tm-signing-title { font-size: 17px; font-weight: 700; letter-spacing: -.02em; }
.tm-signing-sub { font-size: 14px; color: var(--muted); line-height: 1.5; max-width: 280px; }
.tm-signing-sub strong { color: var(--text); }

.tm-transfer-id {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px; color: var(--soft); margin-top: 4px; letter-spacing: .06em;
}

/* Success / error icons */
.tm-success-icon {
  width: 60px; height: 60px; border-radius: 50%;
  display: grid; place-items: center; color: #86efac;
  background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.25);
  margin-bottom: 8px;
}
.tm-error-icon {
  width: 60px; height: 60px; border-radius: 50%;
  display: grid; place-items: center; color: #fca5a5;
  background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.25);
  margin-bottom: 8px;
}

/* ── Responsive ── */
@media (max-width: 600px) {
  .tickets-layout { padding: 28px 16px 80px; }
  .tickets-title { font-size: 34px; }
  .event-card-header { flex-wrap: wrap; }
  .event-header-right { width: 100%; justify-content: flex-end; }
  .stat-chip { padding: 6px 12px; min-width: 46px; }
  .event-title { font-size: 16px; }
  .transfer-btn span { display: none; }
  .cancel-transfer-btn span { display: none; }
}
`;
