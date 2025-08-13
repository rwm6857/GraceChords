importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

const CACHE_NAME = 'gracechords-v2';

workbox.precaching.precacheAndRoute([{"revision":"9f7a6f3253ff960324a674ef838012f2","url":"assets/html2canvas.esm-CBrSDip1.js"},{"revision":"510653bddcd23dc9f513185005a01207","url":"assets/image-FQu8zNSM.js"},{"revision":"2006fce489d7abe572162be51ea03b2c","url":"assets/index-BUK0070_.js"},{"revision":"29126acde553f8c8cc0c994b36994063","url":"assets/index-CpMnaz2S.css"},{"revision":"a1853c1181c70128f034e64b78c395b5","url":"assets/index.es-CuP5Ox_P.js"},{"revision":"558f134b4a2d5cce0c0e0f2f58da8385","url":"assets/jspdf.es.min-BKyK1DzU.js"},{"revision":"319d42c0e56c058e69164cc61234f581","url":"assets/jszip.min-B_pTMQOz.js"},{"revision":"9ee91666d5b383de6432f9cfef71e440","url":"assets/purify.es-C_uT9hQ1.js"},{"revision":"2ea5e0855d5a3ec3f561b5bc62b39805","url":"fonts/NotoSans-Bold.ttf"},{"revision":"4321108b0cf255575499e2361b6501e0","url":"fonts/NotoSans-BoldItalic.ttf"},{"revision":"a6d070775dd5e6bfff61870528c6248a","url":"fonts/NotoSans-Italic.ttf"},{"revision":"f46b08cc90d994b34b647ae24c46d504","url":"fonts/NotoSans-Regular.ttf"},{"revision":"df54162cc0558efd10aad6553dcfc8fa","url":"fonts/NotoSansMono-Bold.ttf"},{"revision":"85e493e82e6a77206b4d0c36987df3a8","url":"fonts/NotoSansMono-Regular.ttf"},{"revision":"479cacc8126b1b784e9e8dd55fbc4096","url":"index.html"},{"revision":"452c102eba777247b274f5903cb98c70","url":"manifest.webmanifest"},{"revision":"012efbe0dfbd1f8e7d5054087563365b","url":"songs/abba.chordpro"},{"revision":"7430add11b6d67b1debaed8c2e1349c3","url":"songs/above-all.chordpro"},{"revision":"d9caf027b5f2a40b18c3c24c87ff8b76","url":"songs/all-thats-within-me.chordpro"},{"revision":"3ccb3dcc5b22faf2c751311b69c2272a","url":"songs/amazing-grace.chordpro"},{"revision":"96172f38822503b87ccb23aaa61e8beb","url":"songs/ancient-of-days.chordpro"},{"revision":"54c642f75b457d0e23baa151e8126ce4","url":"songs/blessed-be-your-name.chordpro"},{"revision":"7e7051a1a448fa78aa6ff9ea7600c5f7","url":"songs/blow-the-trumpet-in-zion.chordpro"},{"revision":"dc916d09e22ac31d7ae86c5cf0cfcdc0","url":"songs/build-my-life.chordpro"},{"revision":"b6e73f3a4d98b0f19b5ecba827d61cda","url":"songs/calling.chordpro"},{"revision":"3cd963ea093488581039deb26379548e","url":"songs/come-now-is-the-time-to-worship.chordpro"},{"revision":"57fabaf00884f0036079b920ea24abb9","url":"songs/come-to-us-emmanuel.chordpro"},{"revision":"fa15e33e51d64a95c30f957bf40bf62a","url":"songs/creation-is-awaiting.chordpro"},{"revision":"c662f86165352aaa5bb83fe3d0e893cc","url":"songs/dear-brother.chordpro"},{"revision":"990dffbc5f6d86acde6f162a3f02dd59","url":"songs/everlasting-grace.chordpro"},{"revision":"6aed97f737447e4ad1d0b59bd985b00c","url":"songs/glorious-king.chordpro"},{"revision":"c68ef48929b64c59c002bb377913e7ce","url":"songs/god-of-our-fathers.chordpro"},{"revision":"2272d51389d291bdb0cf1a70d30f2aed","url":"songs/great-is-the-lord.chordpro"},{"revision":"18e8cd75718fe1cf6147fc6e1782721e","url":"songs/happy-day.chordpro"},{"revision":"9c8a02c2bbce621df8645103705178a0","url":"songs/he-is-king.chordpro"},{"revision":"f21b91b811d9b3c03dbd563b4193c998","url":"songs/here-i-am-again.chordpro"},{"revision":"f46c3df28aeab7c14913580095b75fd8","url":"songs/here-i-am.chordpro"},{"revision":"47e3b03c206cc7b0e226db847f546f23","url":"songs/holy-spirit-come.chordpro"},{"revision":"eb8aa8591b58cdc6501c0f3d8eb64c71","url":"songs/hope-of-the-nations.chordpro"},{"revision":"a0bb26908aec44eb6a62842feaba5302","url":"songs/i-am-free.chordpro"},{"revision":"0b288c942d5608ed74af5983fa508413","url":"songs/i-enter-in-the-holy-place.chordpro"},{"revision":"d2eb6b7d8f22baa5829dc69223601cfb","url":"songs/i-lift-my-eyes.chordpro"},{"revision":"733931eeeb1098fdddd86514e0283dfa","url":"songs/i-will-follow-you.chordpro"},{"revision":"309938684939b3115321683ae10b5769","url":"songs/ill-always-love-you.chordpro"},{"revision":"3e79aacca91b9f066350df0727b67464","url":"songs/in-jesus-name.chordpro"},{"revision":"deda8ced6eb50e6fa07a181f955c6295","url":"songs/jesus-lamb-of-god.chordpro"},{"revision":"d988111d233baf703a758c52564693e7","url":"songs/jesus-our-refuge.chordpro"},{"revision":"ef7c3df2c31e65d1ed72df2b7d51707a","url":"songs/john-3-16.chordpro"},{"revision":"f763a7a8355496323861888ced7ac5e4","url":"songs/kernel-of-wheat.chordpro"},{"revision":"06aa36cdde5fa3034048977817b28dcf","url":"songs/king-of-kings.chordpro"},{"revision":"0d1bd6b97746c854a81fd9b3005eccae","url":"songs/let-us-sing-to-the-lord.chordpro"},{"revision":"ef8bb3abc13c2556a1aff3ab3ede8ab9","url":"songs/lion-of-judah.chordpro"},{"revision":"c1d30905f181a9bb1a360b4638412424","url":"songs/lord-we-seek.chordpro"},{"revision":"6dff48ba5738c62119a727eb0ad97a21","url":"songs/maranatha.chordpro"},{"revision":"f3c77a9c50f0fcabb5b6674389bcb09d","url":"songs/my-god-you-alone.chordpro"},{"revision":"02cdf1edf91790c44e4670ec490f232f","url":"songs/my-savior-king.chordpro"},{"revision":"d782539b7e19d0e6a4f18c06cc8652cc","url":"songs/oaks-of-righteousness.chordpro"},{"revision":"496b2bc6069b46fb9cc8d5463914f8ee","url":"songs/offline-test.chordpro"},{"revision":"d5fd20f46fbd5835d2d65dd1cabd7a43","url":"songs/on-that-day.chordpro"},{"revision":"494c6a6a8c6bafcd7e316eb5afa5a852","url":"songs/open-up-the-doors-of-heaven.chordpro"},{"revision":"f8e3680d5551f297dccff8a5654420de","url":"songs/preaching-the-cross.chordpro"},{"revision":"893631b4eaf25c8054cbb9b8360bfe21","url":"songs/psalm-150.chordpro"},{"revision":"4795650a55ce86bc8bcffb2eb36cdc54","url":"songs/psalm-27-long-test.chordpro"},{"revision":"21d9c96c5795b1b27971b32723efb06b","url":"songs/righteous-powers.chordpro"},{"revision":"f01086aa49bbf2753045bff8a2ee25e9","url":"songs/rise-and-shout.chordpro"},{"revision":"ee73063182f973213c7fc8641f63258d","url":"songs/season-of-christ.chordpro"},{"revision":"fea5a65c5f33686f4963a91345ef92dd","url":"songs/seek-hope-and-pray.chordpro"},{"revision":"93b76622ffb27912d0871f19d30137dc","url":"songs/sing-sing-sing.chordpro"},{"revision":"4c8df39f513288b39fb5db3cbb93c4cb","url":"songs/the-blood-of-the-missionaries.chordpro"},{"revision":"6d6876d2ff9501705336f7ac68f847bb","url":"songs/what-a-beautiful-name.chordpro"},{"revision":"e654bf6a725ce2613a9c51884b7fe9cd","url":"songs/you-endured-the-cross.chordpro"},{"revision":"f0dd92b3d8e743fe6b167d9b6b4de01f","url":"songs/your-great-love.chordpro"}]);

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('gracechords') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          if (shouldCache(request, response)) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

function shouldCache(request, response) {
  return (
    response && response.ok &&
    (request.destination === 'script' ||
      request.destination === 'style' ||
      request.destination === 'font' ||
      request.destination === 'document' ||
      request.url.includes('/assets/') ||
      request.url.includes('/src/data/') ||
      request.url.includes('/songs/'))
  );
}
