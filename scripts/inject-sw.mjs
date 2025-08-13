import { injectManifest } from 'workbox-build';

injectManifest({
  swSrc: 'src/sw.js',
  swDest: 'docs/sw.js',
  globDirectory: 'docs',
  globPatterns: ['**/*.{js,css,html,ttf,woff,woff2,json,webmanifest,ico,png,svg,chordpro}']
}).then(({ count, size, warnings }) => {
  warnings.forEach((w) => console.warn(w));
  console.log(`Injected ${count} files, totaling ${size} bytes.`);
});
