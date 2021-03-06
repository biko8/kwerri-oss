import { Store, get } from 'idb-keyval';

declare const importScripts: Function;
declare const workbox;
declare const self: any;

importScripts('https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js');

if (workbox) {

  // Avoid async imports
  // see https://developers.google.com/web/tools/workbox/modules/workbox-sw#avoid_async_imports

  console.log(`Yay! Workbox is loaded 🎉`);

  // Precache & Route setup
  // Keep it here or it will not get picked up
  // see workbox-config.jss
  // This array gets injected automagically by the workbox cli
  workbox.precaching.precacheAndRoute([]);

  // default page handler for offline usage, where the browser does not how to handle deep links
  // it's a SPA, so each path that is a navigation should default to index.html
  let defaultSPAPageHandlerVerison;
  defaultSPAPageHandlerVerison = 3;

  // 1st, native service worker version
  if (defaultSPAPageHandlerVerison === 1) {
    self.addEventListener('fetch', (event) => {
      if (event.request.mode === 'navigate') {
        event.respondWith(
          caches.match('/index.html').then((response) => {
            return response || fetch(event.request);
          }).catch(error => {
            return fetch(event.request);
          }),
        );
      }
      return;
    });
  }

  // 2nd, workbox version
  if (defaultSPAPageHandlerVerison === 2) {
    workbox.routing.registerRoute(
      ({ event }) => event.request.mode === 'navigate',
      async () => {
        const defaultBase = '/index.html';
        return caches
          .match(workbox.precaching.getCacheKeyForURL(defaultBase))
          .then(response => {
            return response || fetch(defaultBase);
          })
          .catch(err => {
            return fetch(defaultBase);
          });
      },
    );
  }

  // 3rd, best workbox version
  if (defaultSPAPageHandlerVerison === 3) {
    workbox.routing.registerNavigationRoute(
      // Assuming '/index.html' has been precached,
      // look up its corresponding cache key.
      workbox.precaching.getCacheKeyForURL('/index.html'),
    );
  }

  // Google Analytics cache setup
  // see https://developers.google.com/web/tools/workbox/modules/workbox-google-analytics
  workbox.googleAnalytics.initialize({
    parameterOverrides: {
      cd1: 'offline',
    },
    hitFilter: (params) => {
      const queueTimeInSeconds = Math.round(params.get('qt') / 1000);
      params.set('cm1', queueTimeInSeconds);
    },
  });

  // Google Fonts cache setup
  // see https://developers.google.com/web/tools/workbox/guides/common-recipes#google_fonts
  workbox.routing.registerRoute(
    /^https:\/\/fonts\.googleapis\.com/,
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'google-fonts-stylesheets',
    }),
  );

  // Cache the underlying font files with a cache-first strategy for 1 year.
  workbox.routing.registerRoute(
    /^https:\/\/fonts\.gstatic\.com/,
    new workbox.strategies.CacheFirst({
      cacheName: 'google-fonts-webfonts',
      plugins: [
        new workbox.cacheableResponse.Plugin({
          statuses: [0, 200],
        }),
        new workbox.expiration.Plugin({
          maxAgeSeconds: 60 * 60 * 24 * 365,
          maxEntries: 30,
          purgeOnQuotaError: true, // Automatically cleanup if quota is exceeded.
        }),
      ],
    }),
  );

  // OAuth header interceptor
  workbox.routing.registerRoute(
    ({ url }) => {
      return /map\.png/.test(url);
    },
    async ({ event, url }) => {
      // get the eventual token
      const customStore = new Store('swl-db', 'swl-db-store');
      const oAuthToken = await get<string>('token', customStore);

      // if token available, set it as the Authorization header
      if (!!oAuthToken) {
        const modifiedHeaders = new Headers(event.request.headers);
        modifiedHeaders.set('Authorization', oAuthToken);
        const overwrite = {
          headers: modifiedHeaders,
        };
        const modifiedRequest = new Request(url.toString(), overwrite);
        return fetch(modifiedRequest);
      }

      const defaultNotAuthedBase = '/assets/not_authorized.png';
      return caches
        .match(workbox.precaching.getCacheKeyForURL(defaultNotAuthedBase))
        .then(response => {
          return response || fetch(defaultNotAuthedBase);
        })
        .catch(err => {
          return fetch(defaultNotAuthedBase);
        });
    },
  );

  // Flags default handler
  const flagsHandler = new workbox.strategies.CacheFirst({
    cacheName: 'flags-cache',
  });
  workbox.routing.registerRoute(/assets\/flags\/(?![_])(.*)/, args => {
    const defaultFlag = () => caches.match(
      workbox.precaching.getCacheKeyForURL('/assets/_defaultflag.png'),
    );
    return flagsHandler.handle(args)
      .then(response => {
        if (!response || response.status === 404) {
          return defaultFlag();
        }
        return response;
      }).catch(() => {
        return defaultFlag();
      });
  });

  // Liefi handler
  const lieFiDataHandler = new workbox.strategies.NetworkFirst({
    networkTimeoutSeconds: 5,
  });
  workbox.routing.registerRoute(/assets\/data\.json/, lieFiDataHandler);

} else {
  console.log(`Boo! Workbox didn't load 😬`);
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLIENTS_CLAIM') {
    self.clients.claim();
  }
});

