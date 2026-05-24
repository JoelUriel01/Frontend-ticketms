"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";


export default function InviteOrganizerPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  function handleInvite() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus("error");
      setMessage("Ingresa un correo electrónico válido.");
      return;
    }
    setShowConfirm(true);
  }

async function confirmInvite() {
  setShowConfirm(false);
  setStatus("loading");
  setMessage("");

  try {
    // Obtener el token de la sesión actual
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      setStatus("error");
      setMessage("No hay sesión activa. Inicia sesión primero.");
      return;
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/admin/invite-organizer`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`, // ← esto faltaba
        },
        body: JSON.stringify({ email }),
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Error al enviar la invitación");

    setStatus("success");
    setMessage(`Invitación enviada a ${email}`);
    setEmail("");
  } catch (err: unknown) {
    setStatus("error");
    setMessage(err instanceof Error ? err.message : "Error inesperado");
  }
}

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white border border-zinc-200 rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                <IconWarning />
              </div>
              <h2 className="text-base font-semibold text-zinc-900">¿Confirmar invitación?</h2>
            </div>
            <p className="text-sm text-zinc-500 mb-1">Se enviará un enlace de acceso a:</p>
            <p className="text-sm font-medium text-zinc-900 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 break-all mb-6">
              {email}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 text-sm font-medium text-zinc-600 border border-zinc-200 rounded-xl hover:bg-zinc-50 active:scale-[0.98] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={confirmInvite}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-zinc-900 rounded-xl hover:bg-zinc-700 active:scale-[0.98] transition-all"
              >
                Sí, enviar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-8">
          <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">
            Admin / Organizadores
          </span>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 tracking-tight">
            Invitar organizador
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Le llegará un correo con el enlace para activar su cuenta.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
          <label
            htmlFor="email"
            className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2"
          >
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status !== "idle") setStatus("idle");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            placeholder="organizador@correo.com"
            disabled={status === "loading"}
            className="w-full px-4 py-2.5 text-sm border border-zinc-200 rounded-xl bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition disabled:opacity-50"
          />

          <button
            onClick={handleInvite}
            disabled={status === "loading"}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-700 active:scale-[0.98] text-white text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading" ? (
              <>
                <Spinner />
                Enviando...
              </>
            ) : (
              <>
                <IconSend />
                Enviar invitación
              </>
            )}
          </button>

          {/* Feedback */}
          {status === "success" && (
            <div className="mt-4 flex items-start gap-2.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
              <IconCheck />
              <span>{message}</span>
            </div>
          )}
          {status === "error" && (
            <div className="mt-4 flex items-start gap-2.5 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <IconAlert />
              <span>{message}</span>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <p className="mt-4 text-center text-xs text-zinc-400">
          El rol de organizador se asigna automáticamente al aceptar la invitación.
        </p>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 19-7z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <path d="M12 9v4m0 4h.01" />
    </svg>
  );
}
