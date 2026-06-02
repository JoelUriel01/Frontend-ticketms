'use client';
import { useEffect } from 'react';
import { API_BASE_URL } from '@/lib/supabase/api';

const KEY_STORE = 'ticketapp-ecdsa-keypair';
const KEY_REGISTERED = 'ticketapp-pubkey-registered';

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function ensureAndRegister(token: string) {
  // Si ya registramos en este dispositivo, salir inmediatamente
  if (localStorage.getItem(KEY_REGISTERED)) return;

  // Generar keypair si no existe localmente
  let stored = localStorage.getItem(KEY_STORE);
  if (!stored) {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const privPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    stored = JSON.stringify({
      publicKey: bufToB64(pubRaw),
      privateKey: bufToB64(privPkcs8),
    });
    localStorage.setItem(KEY_STORE, stored);
  }

  const { publicKey } = JSON.parse(stored);

  const res = await fetch(`${API_BASE_URL}/users/me/public-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ publicKey }),
  });

  if (res.ok) {
    // Marcar como registrado para no volver a llamar en esta sesión/dispositivo
    localStorage.setItem(KEY_REGISTERED, '1');
  }
}

export function useEnsurePublicKey(token: string | null) {
  useEffect(() => {
    if (!token) return;
    ensureAndRegister(token).catch(console.error);
  }, [token]);
}