
self.addEventListener('push', (event) => {
  if (!event.data) return;
 
  const data = event.data.json();
 
  const options = {
    body:    data.body,
    icon:    data.icon  ?? '/icons/icon-192.png',
    badge:   data.badge ?? '/icons/badge-72.png',
    data:    { url: data.url },
    actions: [
      { action: 'open',    title: 'Ver evento' },
      { action: 'dismiss', title: 'Ignorar' },
    ],
    vibrate: [100, 50, 100],
  };
 
  event.waitUntil(
    self.registration.showNotification(data.title, options),
  );
});
 
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
 
  if (event.action === 'dismiss') return;
 
  const url = event.notification.data?.url ?? '/';
 
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Si ya hay una pestaña abierta con la app, enfocarla
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Si no, abrir nueva pestaña
        if (clients.openWindow) return clients.openWindow(url);
      }),
  );
});