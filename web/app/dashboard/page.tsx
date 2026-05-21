'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { API_BASE_URL } from '@/lib/supabase/api';

type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
  };
};

type AppUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

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

      setAuthUser(user as AuthUser);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push('/login');
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/users/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Error al cargar perfil');
        }

        const data = (await res.json()) as AppUser;
        setAppUser(data);
        setFullName(data.fullName);

        // Redirect organizers to events management
        if (data.role === 'organizer') {
          router.push('/events');
          return;
        }

        setLoading(false);
      } catch (err: any) {
        setErrorMessage(err.message);
        setLoading(false);
      }
    }

    loadData();
  }, [router, supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  async function handleUpdateProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!authUser) return;
    if (!fullName.trim()) {
      setErrorMessage('El nombre no puede estar vacío.');
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setErrorMessage('Sesión inválida. Vuelve a iniciar sesión.');
        setSaving(false);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ fullName: fullName.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al actualizar perfil');
      }

      const data = (await res.json()) as AppUser;
      setAppUser(data);
      setSuccessMessage('Perfil actualizado correctamente.');
      setEditOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  const initials = (appUser?.fullName ?? authUser?.user_metadata?.full_name ?? 'U')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const roleBadge: Record<string, { label: string; color: string }> = {
    admin: { label: 'Admin', color: '#7B2FBE' },
    organizer: { label: 'Organizador', color: '#0EA5E9' },
    user: { label: 'Usuario', color: '#FF4D00' },
  };

  const badge = roleBadge[appUser?.role ?? 'user'] ?? roleBadge.user;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-[#FF4D00] border-t-transparent animate-spin" />
          <p className="text-zinc-500 text-sm">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white" style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Navbar ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4"
        style={{
          backdropFilter: 'blur(18px)',
          background: 'rgba(10,10,10,0.8)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <button onClick={() => router.push('/')} className="text-xl font-bold tracking-tight">
          <span style={{ color: '#FF4D00' }}>ticket</span>flow
        </button>

        <div className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
          <button onClick={() => router.push('/discover')} className="hover:text-white transition-colors">
            Explorar eventos
          </button>
          <button onClick={() => router.push('/tickets/me')} className="hover:text-white transition-colors">
            Mis boletos
          </button>
        </div>

        <button
          onClick={handleLogout}
          className="text-sm px-4 py-2 rounded-full border border-zinc-800 text-zinc-400 hover:border-red-500/50 hover:text-red-400 transition-all"
        >
          Cerrar sesión
        </button>
      </nav>

      {/* ── Content ── */}
      <main className="pt-24 pb-16 px-6 md:px-16 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold flex-shrink-0"
              style={{ background: 'rgba(255,77,0,0.15)', color: '#FF4D00', border: '1px solid rgba(255,77,0,0.2)' }}
            >
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: `${badge.color}20`, color: badge.color }}
                >
                  {badge.label}
                </span>
              </div>
              <h1
                className="text-2xl md:text-3xl font-black tracking-tight"
                style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
              >
                {appUser?.fullName ?? authUser?.user_metadata?.full_name ?? 'Usuario'}
              </h1>
              <p className="text-sm text-zinc-500 mt-0.5">{authUser?.email}</p>
            </div>
          </div>

          <button
            onClick={() => router.push('/discover')}
            className="flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-sm text-black transition-all hover:scale-105 active:scale-95 self-start md:self-auto"
            style={{ background: '#FF4D00' }}
          >
            Explorar eventos →
          </button>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div
            className="mb-6 px-5 py-4 rounded-2xl text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}
          >
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div
            className="mb-6 px-5 py-4 rounded-2xl text-sm"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#6EE7B7' }}
          >
            {successMessage}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* ── Profile card ── */}
          <div
            className="md:col-span-2 rounded-3xl p-7"
            style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs uppercase tracking-widest text-zinc-500">Información de cuenta</p>
              <button
                onClick={() => setEditOpen(!editOpen)}
                className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-all"
              >
                {editOpen ? 'Cancelar' : 'Editar'}
              </button>
            </div>

            <div className="space-y-4">
              {[
                { label: 'Nombre completo', value: appUser?.fullName },
                { label: 'Correo electrónico', value: authUser?.email },
                { label: 'Rol', value: badge.label },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="text-sm text-zinc-500">{item.label}</span>
                  <span className="text-sm font-medium">{item.value}</span>
                </div>
              ))}
            </div>

            {/* Edit form */}
            {editOpen && (
              <form onSubmit={handleUpdateProfile} className="mt-6 space-y-4">
                <div>
                  <label className="text-xs text-zinc-500 mb-2 block">Nuevo nombre completo</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder="Tu nombre completo"
                    className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#FF4D00')}
                    onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-black transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: '#FF4D00' }}
                >
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </form>
            )}
          </div>

          {/* ── Status card ── */}
          <div className="flex flex-col gap-5">
            <div
              className="rounded-3xl p-6"
              style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs uppercase tracking-widest text-zinc-500 mb-5">Estado de cuenta</p>
              <div className="space-y-3">
                {[
                  { label: 'Email verificado', value: appUser?.emailVerified },
                  { label: 'Teléfono verificado', value: appUser?.phoneVerified },
                  { label: 'MFA activado', value: appUser?.mfaEnabled },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">{item.label}</span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={
                        item.value
                          ? { background: 'rgba(16,185,129,0.12)', color: '#34D399' }
                          : { background: 'rgba(255,255,255,0.05)', color: '#71717A' }
                      }
                    >
                      {item.value ? 'Sí' : 'No'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div
              className="rounded-3xl p-6"
              style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs uppercase tracking-widest text-zinc-500 mb-5">Accesos rápidos</p>
              <div className="space-y-2">
                {[
                  { label: '🎟️  Mis boletos', path: '/tickets/me' },
                  { label: '🔍  Descubrir eventos', path: '/discover' },
                  { label: '💳  Checkout', path: '/checkout' },
                ].map((item) => (
                  <button
                    key={item.path}
                    onClick={() => router.push(item.path)}
                    className="w-full text-left text-sm px-4 py-2.5 rounded-xl text-zinc-400 hover:text-white transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,77,0,0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Logout */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleLogout}
            className="text-sm text-zinc-600 hover:text-red-400 transition-colors"
          >
            Cerrar sesión →
          </button>
        </div>
      </main>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap');
      `}</style>
    </div>
  );
}
