'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { API_BASE_URL } from '@/lib/supabase/api';
import { useEnsurePublicKey } from '@/lib/useEnsurePublicKey';

// ─── Crypto helpers ──────────────────────────────────────────────────────────

// BUG FIX: generateAndStoreKeyPair debe estar a nivel de módulo, NO dentro de handleRespond
async function generateAndStoreKeyPair(): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const privPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const publicKey = btoa(String.fromCharCode(...new Uint8Array(pubRaw)));
  const privateKey = btoa(String.fromCharCode(...new Uint8Array(privPkcs8)));
  localStorage.setItem('ticketapp-ecdsa-keypair', JSON.stringify({ publicKey, privateKey }));
  return publicKey; // ← retorna la publicKey para poder registrarla inmediatamente
}

async function getPrivateKey(): Promise<CryptoKey | null> {
  try {
    const stored = localStorage.getItem('ticketapp-ecdsa-keypair');
    if (!stored) return null;
    const { privateKey: privB64 } = JSON.parse(stored);
    const bin = atob(privB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return await crypto.subtle.importKey(
      'pkcs8',
      bytes.buffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
  } catch {
    return null;
  }
}

async function signPayload(payload: object, privateKey: CryptoKey): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Transfer = {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  createdAt: string;
  expiresAt?: string;
  sender: {
    id: string;
    fullName: string;
    email: string;
  };
  ticket: {
    id: string;
    seatLabel?: string;
    event: {
      id: string;
      title: string;
      startsAt: string;
      venueName?: string;
      venueCity?: string;
    };
  };
};

type ActionState = {
  transferId: string;
  action: 'ACCEPT' | 'REJECT';
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function IncomingTransfersPage() {
  const router = useRouter();
  const supabase = createClient();

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<ActionState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  useEnsurePublicKey(token);

  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push('/login');
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push('/login');
        return;
      }

      setUserId(user.id);
      setToken(session.access_token);

      await fetchTransfers(session.access_token);
    }

    loadData();
  }, [router, supabase]);

  async function fetchTransfers(accessToken: string) {
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/transfers/incoming`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al cargar transferencias');
      }

      const data = (await res.json()) as Transfer[];
      setTransfers(
        data.filter(
          (t) =>
            t.status === 'PENDING' &&
            t.ticket != null &&
            t.ticket.event != null,
        ),
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  async function handleRespond(transferId: string, action: 'ACCEPT' | 'REJECT') {
    if (!token || !userId) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setProcessing({ transferId, action });

    // BUG FIX: attempt es una función correctamente definida y llamada,
    // con generateAndStoreKeyPair siendo INVOCADA (no solo declarada) en el retry.
    async function attempt(isRetry = false): Promise<void> {
      if (isRetry) {
        // 1. Limpiar keys viejas
        localStorage.removeItem('ticketapp-ecdsa-keypair');
        localStorage.removeItem('ticketapp-pubkey-registered');

        // 2. Generar nuevo par y obtener la publicKey
        //    BUG ANTERIOR: se declaraba la función pero nunca se llamaba con await
        const newPublicKey = await generateAndStoreKeyPair(); // ← LLAMADA real

        // 3. Registrar la nueva clave en el servidor
        await fetch(`${API_BASE_URL}/users/me/public-key`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ publicKey: newPublicKey }),
        });
      }

      const privateKey = await getPrivateKey();
      if (!privateKey) {
        throw new Error('No se encontró tu llave privada. Por favor recarga la página.');
      }

      const timestamp = new Date().toISOString();

      // El payload que se firma incluye recipientId para que el servidor
      // pueda verificar que el que responde es realmente el destinatario.
      const payloadToSign = {
        transferId,
        recipientId: userId,
        action,
        timestamp,
      };

      const signature = await signPayload(payloadToSign, privateKey);

      // BUG FIX: el body NO incluye recipientId explícito porque el servidor
      // lo obtiene del JWT. Mandarlo causaba el 400 (campo inesperado).
      // El servidor reconstruye el payload con el userId del JWT para verificar.
      const res = await fetch(`${API_BASE_URL}/transfers/${transferId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, signature, timestamp }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg: string = err.message ?? '';

        // Auto-recovery: si la firma no es válida y aún no hemos reintentado,
        // regenerar keys y reintentar UNA sola vez.
        if (!isRetry && (res.status === 422 || msg.toLowerCase().includes('ecdsa'))) {
          return attempt(true);
        }

        throw new Error(msg || 'Error al responder la transferencia');
      }

      const label = action === 'ACCEPT' ? 'aceptada' : 'rechazada';
      setSuccessMessage(`Transferencia ${label} correctamente.`);
      setTransfers((prev) => prev.filter((t) => t.id !== transferId));
    }

    try {
      await attempt();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setProcessing(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function isExpiringSoon(expiresAt?: string) {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() - Date.now() < 1000 * 60 * 60 * 24;
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-[#FF4D00] border-t-transparent animate-spin" />
          <p className="text-zinc-500 text-sm">Cargando transferencias...</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen bg-[#0A0A0A] text-white"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {/* ── Navbar ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-16 py-4"
        style={{
          background: 'rgba(10,10,10,0.85)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <button
          onClick={() => router.push('/')}
          className="text-xl font-black tracking-tighter"
          style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
        >
          Ticket<span style={{ color: '#FF4D00' }}>Master</span>
        </button>
        <button
          onClick={() => router.push('/tickets/me')}
          className="text-sm px-4 py-2 rounded-full border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white transition-all"
        >
          Mi cuenta
        </button>
      </nav>

      {/* ── Content ── */}
      <main className="pt-24 pb-16 px-6 md:px-16 max-w-4xl mx-auto">

        {/* Page header */}
        <div className="mb-10">
          <h1
            className="text-3xl md:text-4xl font-black tracking-tight mb-2"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
          >
            Transferencias recibidas
          </h1>
          <p className="text-zinc-500 text-sm">
            Boletos que otros usuarios quieren transferirte. Acéptalos antes de que expiren.
          </p>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div
            className="mb-6 px-5 py-4 rounded-2xl text-sm"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#FCA5A5',
            }}
          >
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div
            className="mb-6 px-5 py-4 rounded-2xl text-sm"
            style={{
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              color: '#6EE7B7',
            }}
          >
            {successMessage}
          </div>
        )}

        {/* Empty state */}
        {transfers.length === 0 && !loading && (
          <div
            className="rounded-3xl p-12 flex flex-col items-center justify-center text-center gap-4"
            style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: 'rgba(255,77,0,0.1)' }}
            >
              📭
            </div>
            <p className="text-zinc-400 text-sm">No tienes transferencias pendientes.</p>
            <button
              onClick={() => router.push('/tickets/me')}
              className="text-xs px-4 py-2 rounded-full border border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 transition-all"
            >
              Ver mis boletos
            </button>
          </div>
        )}

        {/* Transfer cards */}
        <div className="space-y-4">
          {transfers.map((transfer) => {
            const isAccepting =
              processing?.transferId === transfer.id && processing.action === 'ACCEPT';
            const isRejecting =
              processing?.transferId === transfer.id && processing.action === 'REJECT';
            const isProcessingThis = isAccepting || isRejecting;
            const expiringSoon = isExpiringSoon(transfer.expiresAt);

            return (
              <div
                key={transfer.id}
                className="rounded-3xl p-6 md:p-7 transition-all"
                style={{
                  background: '#111111',
                  border: expiringSoon
                    ? '1px solid rgba(251,191,36,0.3)'
                    : '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">

                  {/* Left: info */}
                  <div className="flex-1 min-w-0">

                    {/* Event name */}
                    <div className="flex items-start gap-3 mb-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0 mt-0.5"
                        style={{ background: 'rgba(255,77,0,0.12)', color: '#FF4D00' }}
                      >
                        🎟️
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-bold text-base leading-tight truncate">
                          {transfer.ticket?.event?.title ?? 'Evento desconocido'}
                        </h2>
                        {transfer.ticket.event.venueName && (
                          <p className="text-xs text-zinc-500 mt-0.5 truncate">
                            📍 {transfer.ticket.event.venueName}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div>
                        <p className="text-xs text-zinc-600 mb-0.5">Fecha del evento</p>
                        <p className="text-zinc-300">
                          {transfer.ticket.event.startsAt
                            ? formatDate(transfer.ticket.event.startsAt)
                            : '—'}
                        </p>
                      </div>
                      {transfer.ticket?.seatLabel && (
                        <div>
                          <p className="text-xs text-zinc-600 mb-0.5">Asiento</p>
                          <p className="text-zinc-300">{transfer.ticket.seatLabel}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-zinc-600 mb-0.5">Enviado por</p>
                        <p className="text-zinc-300 truncate">
                          {transfer.sender.fullName}
                          <span className="text-zinc-600 ml-1 text-xs">
                            ({transfer.sender.email})
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-600 mb-0.5">Recibido el</p>
                        <p className="text-zinc-300">{formatDate(transfer.createdAt)}</p>
                      </div>
                    </div>

                    {/* Expiry warning */}
                    {expiringSoon && transfer.expiresAt && (
                      <div
                        className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                        style={{ background: 'rgba(251,191,36,0.1)', color: '#FCD34D' }}
                      >
                        ⚠️ Expira pronto · {formatDate(transfer.expiresAt)}
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex md:flex-col gap-3 flex-shrink-0 md:min-w-[140px]">
                    <button
                      onClick={() => handleRespond(transfer.id, 'ACCEPT')}
                      disabled={isProcessingThis}
                      className="flex-1 md:flex-none py-2.5 px-5 rounded-xl text-sm font-semibold text-black transition-all hover:opacity-90 disabled:opacity-40"
                      style={{ background: '#FF4D00' }}
                    >
                      {isAccepting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
                          Aceptando
                        </span>
                      ) : (
                        'Aceptar'
                      )}
                    </button>

                    <button
                      onClick={() => handleRespond(transfer.id, 'REJECT')}
                      disabled={isProcessingThis}
                      className="flex-1 md:flex-none py-2.5 px-5 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#71717A',
                      }}
                      onMouseEnter={(e) => {
                        if (!isProcessingThis) {
                          e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
                          e.currentTarget.style.color = '#FCA5A5';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                        e.currentTarget.style.color = '#71717A';
                      }}
                    >
                      {isRejecting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-3.5 h-3.5 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin" />
                          Rechazando
                        </span>
                      ) : (
                        'Rechazar'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap');
      `}</style>
    </div>
  );
}
