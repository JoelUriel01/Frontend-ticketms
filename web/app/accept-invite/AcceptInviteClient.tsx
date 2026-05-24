'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AcceptInviteClient() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();

  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError]         = useState('');
  const [needsEmail, setNeedsEmail] = useState(false);
  const [ready, setReady]           = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    const type  = searchParams.get('type');
    if (token && type === 'invite') {
      setNeedsEmail(true);
    }
  }, [searchParams]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError('');
    const token = searchParams.get('token') ?? '';

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'invite',
    });

    if (error) {
      setError('Error al verificar: ' + error.message);
    } else {
      setNeedsEmail(false);
      setReady(true);
    }
    setVerifying(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.replace('/discover');
  }

  if (needsEmail && !ready) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0c0c0d',
        fontFamily: 'system-ui', padding: '1rem'
      }}>
        <div style={{
          width: '100%', maxWidth: 400, background: '#141416',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, padding: '2rem'
        }}>
          <h1 style={{ color: '#e9e9eb', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Confirma tu correo
          </h1>
          <p style={{ color: '#8a8a8e', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Ingresa el correo al que llegó la invitación.
          </p>
          <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tu@correo.com"
              style={{
                width: '100%', padding: '0.65rem 1rem', borderRadius: 8,
                border: '1px solid #333', background: '#1a1a1d',
                color: '#e9e9eb', fontSize: '0.9rem', outline: 'none',
              }}
            />
            {error && <p style={{ color: '#f87171', fontSize: '0.8rem' }}>{error}</p>}
            <button
              type="submit"
              disabled={verifying}
              style={{
                padding: '0.75rem', borderRadius: 8, border: 'none',
                background: '#00c2b3', color: '#0c0c0d', fontWeight: 700,
                fontSize: '0.9rem', cursor: verifying ? 'not-allowed' : 'pointer',
                opacity: verifying ? 0.6 : 1,
              }}
            >
              {verifying ? 'Verificando...' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (ready) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0c0c0d',
        fontFamily: 'system-ui', padding: '1rem'
      }}>
        <div style={{
          width: '100%', maxWidth: 400, background: '#141416',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, padding: '2rem'
        }}>
          <h1 style={{ color: '#e9e9eb', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Bienvenido como Organizador
          </h1>
          <p style={{ color: '#8a8a8e', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Establece tu contraseña para activar tu cuenta.
          </p>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', color: '#8a8a8e', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Mínimo 8 caracteres"
                style={{
                  width: '100%', padding: '0.65rem 1rem', borderRadius: 8,
                  border: '1px solid #333', background: '#1a1a1d',
                  color: '#e9e9eb', fontSize: '0.9rem', outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#8a8a8e', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                placeholder="Repite tu contraseña"
                style={{
                  width: '100%', padding: '0.65rem 1rem', borderRadius: 8,
                  border: '1px solid #333', background: '#1a1a1d',
                  color: '#e9e9eb', fontSize: '0.9rem', outline: 'none',
                }}
              />
            </div>
            {error && <p style={{ color: '#f87171', fontSize: '0.8rem' }}>{error}</p>}
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.75rem', borderRadius: 8, border: 'none',
                background: '#00c2b3', color: '#0c0c0d', fontWeight: 700,
                fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1, marginTop: '0.5rem'
              }}
            >
              {loading ? 'Activando cuenta...' : 'Activar cuenta'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0c0c0d',
      fontFamily: 'system-ui', color: '#8a8a8e'
    }}>
      <p>Link de invitación no válido.</p>
    </div>
  );
}
