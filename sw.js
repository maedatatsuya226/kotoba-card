// Service Worker for kotoba-card (ST絵カード呼称トレーニング)
// 全アセットを初回訪問時にキャッシュし、以降オフラインで動作させる

const CACHE_NAME = 'kotoba-card-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './data/cards.json',
  './data/categories.json',
  './images/app/kotoba-card-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_ASSETS);

    // cards.json から画像URLを生成して追加キャッシュ
    try {
      const res = await fetch('./data/cards.json', { cache: 'no-store' });
      const cards = await res.json();
      const imageUrls = cards.map(
        (c) => `./images/${c.category}/${c.id}.png`
      );
      // チャンク化して安全に追加
      for (let i = 0; i < imageUrls.length; i += 20) {
        await cache.addAll(imageUrls.slice(i, i + 20));
      }
    } catch (e) {
      // 画像キャッシュ失敗してもインストール自体は成功させる
      // (fetchイベントで個別にキャッシュされる)
    }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : null))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    // 1. キャッシュ優先
    const cached = await caches.match(req);
    if (cached) return cached;

    // 2. ネットワーク → 取れたらキャッシュに保存
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      // 3. オフラインかつキャッシュ無し → ナビゲーション要求なら index にフォールバック
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./');
        if (fallback) return fallback;
      }
      throw e;
    }
  })());
});
