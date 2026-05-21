'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { API_BASE_URL } from '@/lib/supabase/api';


interface TicketType {
  id: string;
  name: string;
  description?: string;
  price: string;
  currency: string;
  capacity: number;
}

export default function TicketTypesPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;

  const supabase = createClient();

  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [ttForm, setTtForm] = useState({
    name: '',
    description: '',
    price: '',
    capacity: '',
    currency: 'MXN',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadTicketTypes() {
    setLoading(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const res = await fetch(
        `${API_BASE_URL}/events/${eventId}/ticket-types`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );

      if (!res.ok) throw new Error('Error al cargar tipos de boleto');

      const data = await res.json();
      setTicketTypes(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (eventId) loadTicketTypes();
  }, [eventId]);

  async function handleCreateTicketType(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesión no encontrada');

const res = await fetch(
  `${API_BASE_URL}/events/${eventId}/ticket-types`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      name: ttForm.name,
      description: ttForm.description || undefined,
      price: ttForm.price,
      capacity: Number(ttForm.capacity),
      currency: ttForm.currency,
    }),
  },
);

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || 'Error al crear tipo de boleto');
      }

      setTtForm({
        name: '',
        description: '',
        price: '',
        capacity: '',
        currency: 'MXN',
      });

      setSuccess('Tipo de boleto creado.');
      await loadTicketTypes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 3000);
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="tt-page-root">
        <header className="tt-header">
          <div>
            <h1 className="tt-title">Tipos de boleto</h1>
            <p className="tt-subtitle">
              Configura precios y capacidad para el evento.
            </p>
          </div>
          <span className="tt-event-id">Evento: {eventId}</span>
        </header>

        {error && (
          <div className="tt-alert tt-alert-error" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="tt-alert tt-alert-success" role="status">
            {success}
          </div>
        )}

        <main className="tt-layout">
          {/* Tabla */}
          <section className="tt-section">
            <h2 className="tt-section-title">Tipos existentes</h2>
            {loading ? (
              <p className="tt-muted">Cargando tipos…</p>
            ) : ticketTypes.length === 0 ? (
              <p className="tt-muted">
                Aún no has creado tipos de boleto para este evento.
              </p>
            ) : (
              <table className="tt-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Descripción</th>
                    <th>Precio</th>
                    <th>Capacidad</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketTypes.map((tt) => (
                    <tr key={tt.id}>
                      <td>{tt.name}</td>
                      <td className="tt-col-description">
                        {tt.description || '—'}
                      </td>
                      <td>
                        ${Number(tt.price).toLocaleString('es-MX')} {tt.currency}
                      </td>
                      <td>{tt.capacity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Formulario */}
          <section className="tt-section tt-form-card">
            <h2 className="tt-section-title">Agregar tipo de boleto</h2>
            <form className="tt-form" onSubmit={handleCreateTicketType}>
              <label className="tt-field">
                <span>Nombre</span>
                <input
                  type="text"
                  placeholder="General, VIP…"
                  value={ttForm.name}
                  onChange={(e) =>
                    setTtForm({ ...ttForm, name: e.target.value })
                  }
                  required
                />
              </label>

              <label className="tt-field">
                <span>Descripción</span>
                <input
                  type="text"
                  placeholder="Opcional"
                  value={ttForm.description}
                  onChange={(e) =>
                    setTtForm({ ...ttForm, description: e.target.value })
                  }
                />
              </label>

              <div className="tt-row">
                <label className="tt-field">
                  <span>Precio</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="250"
                    value={ttForm.price}
                    onChange={(e) =>
                      setTtForm({ ...ttForm, price: e.target.value })
                    }
                    required
                  />
                </label>

                <label className="tt-field">
                  <span>Capacidad</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="100"
                    value={ttForm.capacity}
                    onChange={(e) =>
                      setTtForm({ ...ttForm, capacity: e.target.value })
                    }
                    required
                  />
                </label>
              </div>

              <button type="submit" className="tt-button" disabled={saving}>
                {saving ? 'Guardando…' : 'Agregar tipo'}
              </button>
            </form>
          </section>
        </main>
      </div>
    </>
  );
}

const CSS = `
  .tt-page-root {
    min-height: 100vh;
    background: #0e0e0f;
    color: #e8e8e9;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 1.5rem 2rem 3rem;
  }

  .tt-header {
    max-width: 1100px;
    margin: 0 auto 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
  }

  .tt-title {
    font-size: 1.4rem;
    font-weight: 600;
  }

  .tt-subtitle {
    font-size: 0.9rem;
    color: #8a8a8e;
  }

  .tt-event-id {
    font-size: 0.78rem;
    color: #8a8a8e;
    background: #151516;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.05);
  }

  .tt-alert {
    max-width: 1100px;
    margin: 0 auto 1rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    font-size: 0.85rem;
  }

  .tt-alert-error {
    background: rgba(224,92,92,0.16);
    color: #f29d9d;
    border: 1px solid rgba(224,92,92,0.4);
  }

  .tt-alert-success {
    background: rgba(52,196,115,0.16);
    color: #8af0aa;
    border: 1px solid rgba(52,196,115,0.4);
  }

  .tt-layout {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1.2fr);
    gap: 1.5rem;
  }

  @media (max-width: 900px) {
    .tt-layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .tt-section {
    background: #151517;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.04);
    padding: 1rem 1.1rem 1.2rem;
  }

  .tt-section-title {
    font-size: 0.95rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
  }

  .tt-muted {
    font-size: 0.85rem;
    color: #8a8a8e;
  }

  .tt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }

  .tt-table th,
  .tt-table td {
    padding: 0.5rem 0.4rem;
    text-align: left;
  }

  .tt-table th {
    font-weight: 500;
    color: #a0a0a5;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    font-size: 0.8rem;
  }

  .tt-table tbody tr:nth-child(odd) {
    background: rgba(255,255,255,0.02);
  }

  .tt-col-description {
    max-width: 260px;
  }

  .tt-form-card {
    align-self: flex-start;
  }

  .tt-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.25rem;
  }

  .tt-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
  }

  .tt-field span {
    color: #a0a0a5;
  }

  .tt-field input {
    padding: 0.45rem 0.6rem;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.1);
    background: #111113;
    color: #e8e8e9;
    font-size: 0.9rem;
  }

  .tt-field input:focus {
    outline: none;
    border-color: #00c2b3;
    box-shadow: 0 0 0 1px rgba(0,194,179,0.4);
  }

  .tt-row {
    display: flex;
    gap: 0.75rem;
  }

  @media (max-width: 600px) {
    .tt-row {
      flex-direction: column;
    }
  }

  .tt-button {
    margin-top: 0.5rem;
    padding: 0.5rem 0.9rem;
    border-radius: 999px;
    border: none;
    background: #00c2b3;
    color: #050506;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    align-self: flex-end;
  }

  .tt-button:disabled {
    opacity: 0.7;
    cursor: default;
  }
`;