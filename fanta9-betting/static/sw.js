// Service worker per le notifiche push del browser. Servito dalla radice (/sw.js, non
// /static/sw.js) apposta: cosi' il suo scope di default copre tutto il sito.

self.addEventListener('push', (event) => {
  let dati = {};
  try { dati = event.data ? event.data.json() : {}; } catch (e) { /* payload non JSON, ignora */ }
  const titolo = dati.titolo || 'Gottabet';
  const opzioni = {
    body: dati.testo || '',
    tag: 'gottabet-notifica',
    icon: '/static/icon-192.png',
    badge: '/static/icon-192.png',
  };
  event.waitUntil(self.registration.showNotification(titolo, opzioni));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
