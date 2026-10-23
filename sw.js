// Service worker: guarda as telas no celular para o app abrir na hora.
// Os NÚMEROS nunca passam por aqui (a API é outro endereço e não é guardada).
// Mudou algum arquivo do app? Aumente a VERSAO, senão o celular segue com o antigo.
const VERSAO = 'financas-v26';
const ARQUIVOS = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rede primeiro (pega a versão nova se tiver internet); sem internet, usa a guardada.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    // "no-cache": sempre pergunta ao servidor se mudou (o GitHub manda o navegador
    // guardar por 10 min, e aí a versão nova demorava a aparecer).
    fetch(e.request.url, { cache: 'no-cache' }).then((r) => {
      const copia = r.clone();
      caches.open(VERSAO).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
