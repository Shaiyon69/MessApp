const CACHE_NAME = 'messapp-v2';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];
const PUSH_DATA_KEYS = ['type', 'message_id', 'dm_room_id', 'server_id', 'channel_id', 'sender_id', 'request_id'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Ask every on-screen window which conversation it is showing. The answer can
// only come from the page, and the worker may have been restarted for this very
// push, so it is queried per push rather than cached.
const askOpenWindows = async () => {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const onScreen = windows.filter((client) => client.focused || client.visibilityState === 'visible');
  return Promise.all(onScreen.map((client) => new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 400);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data?.activeConversationId || null);
    };
    client.postMessage({ type: 'MESSAPP_ACTIVE_CONVERSATION_QUERY' }, [channel.port2]);
  })));
};

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json?.() || {};
  } catch (_error) {
    return;
  }
  const notification = payload.notification || {};
  const data = payload.data || {};
  if (!notification.title || !['dm_message', 'channel_message', 'friend_request'].includes(data.type)) return;
  event.waitUntil((async () => {
    const conversationId = data.dm_room_id || data.channel_id;
    if (conversationId && (await askOpenWindows()).includes(conversationId)) return;
    await self.registration.showNotification(notification.title, {
      body: notification.body || 'New message',
      icon: '/messapp-icon-192.png',
      badge: '/messapp-icon-192.png',
      tag: data.dm_room_id ? `dm-${data.dm_room_id}` : data.channel_id ? `channel-${data.channel_id}` : `friend-${data.sender_id}`,
      renotify: true,
      data
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existingClient = clients[0];
    if (existingClient) {
      await existingClient.focus();
      existingClient.postMessage({ type: 'MESSAPP_PUSH_OPEN', data });
      return;
    }
    const url = new URL('/', self.location.origin);
    url.searchParams.set('push_type', data.type || '');
    for (const key of PUSH_DATA_KEYS) {
      if (key !== 'type' && data[key]) url.searchParams.set(key, String(data[key]));
    }
    await self.clients.openWindow(url.href);
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Bypass service worker for API calls and Supabase services
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.in') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/realtime/') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/storage/v1/')
  ) {
    return;
  }

  // Bypass extension and non-GET requests
  if (url.protocol === 'chrome-extension:' || e.request.method !== 'GET') {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) {
        // Stale-while-revalidate for assets
        fetch(e.request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, response));
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(e.request).then((response) => {
        if (response && response.status === 200 && e.request.url.startsWith('http')) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return response;
      }).catch(() => {
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
