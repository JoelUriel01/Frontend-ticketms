'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0c0c0d; }
        .login-input {
          width: 100%; padding: 0.75rem 1rem;
          background: #1a1a1d; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px; color: #e9e9eb; font-size: 0.9rem;
          outline: none; transition: border-color 180ms ease;
          font-family: 'Satoshi', sans-serif;
        }
        .login-input:focus { border-color: #00c2b3; }
        .login-input::placeholder { color: #46464d; }
      `}</style>

      <main style={{
        minHeight: '100vh', background: '#0c0c0d',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Satoshi', 'Inter', system-ui, sans-serif",
        padding: '1rem',
      }}>
        {/* Orb decorativo */}
        <div style={{
          position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,194,179,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          width: '100%', maxWidth: 420, position: 'relative', zIndex: 1,
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              background: 'rgba(0,194,179,0.1)', border: '1px solid rgba(0,194,179,0.2)',
              borderRadius: '999px', padding: '0.4rem 1rem', marginBottom: '1.5rem',
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#00c2b3', letterSpacing: '0.06em' }}>
                🎟 TICKETFLOW
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e9e9eb', letterSpacing: '-0.03em' }}>
              Bienvenido de nuevo
            </h1>
            <p style={{ marginTop: '0.4rem', fontSize: '0.875rem', color: '#8a8a8e' }}>
              Inicia sesión para continuar
            </p>
          </div>

          {/* Card */}
          <div style={{
            background: '#141416', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 18, padding: '2rem',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}>

            {/* Botón Google */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              style={{
                width: '100%', padding: '0.75rem 1rem',
                background: '#1a1a1d', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, color: '#e9e9eb', fontSize: '0.9rem', fontWeight: 600,
                cursor: googleLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                transition: 'background 180ms ease, border-color 180ms ease',
                fontFamily: "'Satoshi', sans-serif",
                opacity: googleLoading ? 0.6 : 1,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#222226')}
              onMouseLeave={e => (e.currentTarget.style.background = '#1a1a1d')}
            >
              {/* Google SVG */}
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19.1 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.4-5.1l-6.2-5.2C29.3 35.5 26.8 36 24 36c-5.1 0-9.5-3.2-11.3-7.8l-6.6 5.1C9.5 39.6 16.3 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.2 5.2C41 36.2 44 30.5 44 24c0-1.2-.1-2.4-.4-3.5z"/>
              </svg>
              {googleLoading ? 'Redirigiendo...' : 'Continuar con Google'}
            </button>

            {/* Divider */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              margin: '1.25rem 0',
            }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
              <span style={{ fontSize: '0.75rem', color: '#46464d', fontWeight: 500 }}>o continúa con email</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#8a8a8e', marginBottom: '0.4rem' }}>
                  Correo electrónico
                </label>
                <input
                  className="login-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  required
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#8a8a8e' }}>
                    Contraseña
                  </label>
                </div>
                <input
                  className="login-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <div style={{
                  padding: '0.75rem 1rem', borderRadius: 8,
                  background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
                  color: '#f87171', fontSize: '0.825rem',
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '0.8rem',
                  background: '#00c2b3', border: 'none', borderRadius: 10,
                  color: '#0c0c0d', fontSize: '0.9rem', fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  transition: 'opacity 180ms ease, transform 180ms ease',
                  fontFamily: "'Satoshi', sans-serif",
                  marginTop: '0.25rem',
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.opacity = '1'; }}
              >
                {loading ? 'Entrando...' : 'Iniciar sesión'}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.875rem', color: '#8a8a8e' }}>
            ¿No tienes cuenta?{' '}
            <Link href="/register" style={{ color: '#00c2b3', fontWeight: 600, textDecoration: 'none' }}>
              Crear cuenta
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}