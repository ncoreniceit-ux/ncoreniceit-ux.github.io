'use strict';

const DB_NAME = 'litread-sw-db';
const DB_VERSION = 1;
const STORE = 'config';
let reminderTimer = null;

// ─── IndexedDB ────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function dbPut(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key: 'reminder', ...data });
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

async function dbGet() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get('reminder');
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror = e => reject(e.target.error);
  });
}

// ─── Reminder check ───────────────────────────────────────────
function startReminderLoop() {
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(checkReminder, 60_000);
}

async function checkReminder() {
  const cfg = await dbGet();
  if (!cfg || !cfg.enabled || !cfg.time) return;

  const now = new Date();
  const [h, m] = cfg.time.split(':').map(Number);
  if (now.getHours() !== h || now.getMinutes() !== m) return;

  const dayMap = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const today = dayMap[now.getDay()];
  if (!cfg.days || !cfg.days.includes(today)) return;

  const nowKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${h}-${m}`;
  if (cfg.lastFired === nowKey) return;

  await dbPut({ ...cfg, lastFired: nowKey });
  await self.registration.showNotification('LitRead 📚', {
    body: '⏰ Đến giờ đọc sách rồi! Mở app và đọc nhé!',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'reading-reminder',
    requireInteraction: false,
    data: { url: './' }
  });
}

// ─── Lifecycle ────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
  startReminderLoop();
});

// ─── Messages from app ────────────────────────────────────────
self.addEventListener('message', async e => {
  if (!e.data) return;
  const { type, payload } = e.data;

  if (type === 'SET_REMINDER') {
    await dbPut(payload);
    startReminderLoop();
    e.ports[0]?.postMessage({ ok: true });
  }

  if (type === 'TEST_NOTIFICATION') {
    await self.registration.showNotification('LitRead 📚', {
      body: '✅ Thông báo hoạt động tốt! Bạn đã cài thành công.',
      icon: './icon-192.png',
      tag: 'test-notif',
      data: { url: './' }
    });
  }

  if (type === 'GET_CONFIG') {
    const cfg = await dbGet();
    e.ports[0]?.postMessage({ config: cfg });
  }
});

// ─── Notification click ───────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if (c.url.includes(self.registration.scope)) return c.focus();
      }
      return self.clients.openWindow(e.notification.data?.url || './');
    })
  );
});
