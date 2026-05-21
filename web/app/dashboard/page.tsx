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


useEffect(() => {
  async function loadData() {
    // 1) Obtener usuario de Supabase Auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      router.push('/login');
      return;
    }

    setAuthUser(user as AuthUser);

    // 2) Obtener token
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.push('/login');
      return;
    }

    try {
      // 3) Llamar a tu API Nest: /users/me
      const res = await fetch(`${API_BASE_URL}/users/me`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al cargar perfil de usuario');
      }

      const data = (await res.json()) as AppUser;

      setAppUser(data);
      setFullName(data.fullName);
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
    // 1) obtener sesión para sacar el access token
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setErrorMessage('Sesión inválida. Vuelve a iniciar sesión.');
      setSaving(false);
      return;
    }

    // 2) llamar a tu backend: PATCH /users/me
    const res = await fetch(`${API_BASE_URL}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        fullName: fullName.trim(),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Error al actualizar perfil');
    }

    const data = (await res.json()) as AppUser;

    // 3) actualizar estado en el front
    setAppUser(data);
    setSuccessMessage('Perfil actualizado correctamente.');
  } catch (err: any) {
    setErrorMessage(err.message);
  } finally {
    setSaving(false);
  }
}

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 px-6 py-16 text-white">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-8">
          <p className="text-white/70">Cargando sesión...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <p className="mb-2 text-sm text-cyan-400">Dashboard</p>
        <h1 className="text-3xl font-semibold">
          Bienvenido {appUser?.fullName ?? authUser?.user_metadata?.full_name ?? 'usuario'}
        </h1>

        {errorMessage ? (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {successMessage}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 rounded-xl border border-white/10 bg-black/20 p-5 text-sm text-white/80">

          <p>
            <span className="font-medium text-white"> email:</span> {authUser?.email}
          </p>
          <p>
            <span className="font-medium text-white">Nombre en app:</span> {appUser?.fullName}
          </p>
          <p>
            <span className="font-medium text-white">Rol:</span> {appUser?.role}
          </p>
          <p>
            <span className="font-medium text-white">Email verificado en tabla:</span>{' '}
            {appUser?.emailVerified ? 'Sí' : 'No'}
          </p>
          <p>
            <span className="font-medium text-white">Teléfono verificado:</span>{' '}
            {appUser?.phoneVerified ? 'Sí' : 'No'}
          </p>
          <p>
            <span className="font-medium text-white">MFA activado:</span>{' '}
            {appUser?.mfaEnabled ? 'Sí' : 'No'}
          </p>
        </div>

        <form onSubmit={handleUpdateProfile} className="mt-6 space-y-4 rounded-xl border border-white/10 bg-black/20 p-5">
          <div>
            <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-white">
              Editar nombre completo
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
              placeholder="Tu nombre completo"
              required
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-cyan-400 px-4 py-3 font-medium text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>

        

        <button
          onClick={handleLogout}
          className="mt-6 rounded-xl bg-red-500 px-4 py-3 font-medium text-white transition hover:bg-red-400"
        >
          Cerrar sesión
        </button>

        
      </div>


    </main>
  );
}