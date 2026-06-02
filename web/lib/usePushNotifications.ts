
/**
 * Convierte la clave VAPID pública (base64url) al Uint8Array que espera
 * pushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
 
/**
 * Registra el Service Worker y suscribe al usuario a Web Push.
 * Llamar tras la interacción del usuario (ej. click en "Activar notificaciones").
 *
 * @param apiBase  Base URL de tu API, ej. "https://api.tuapp.com"
 * @param token    JWT del usuario autenticado (para el header Authorization)
 */
export async function enablePushNotifications(
  apiBase: string,
  token: string,
): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications not supported in this browser.');
    return false;
  }
 
  // 1. Obtener clave pública VAPID del backend
  const keyRes  = await fetch(`${apiBase}/notifications/vapid-public-key`);
  const { publicKey } = await keyRes.json();
 
  // 2. Registrar Service Worker
  const registration = await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
  });
  await navigator.serviceWorker.ready;
 
  // 3. Suscribir al usuario
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
 
  // 4. Enviar suscripción al backend
  const subJson = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
 
  await fetch(`${apiBase}/notifications/subscribe`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(subJson),
  });
 
  return true;
}
 
/**
 * Desactiva las notificaciones push del usuario actual.
 */
export async function disablePushNotifications(
  apiBase: string,
  token: string,
): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
 
  const registration  = await navigator.serviceWorker.ready;
  const subscription  = await registration.pushManager.getSubscription();
  if (!subscription) return;
 
  await fetch(`${apiBase}/notifications/subscribe`, {
    method:  'DELETE',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
 
  await subscription.unsubscribe();
}