import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Für GitHub Pages wird BASE_PATH auf "/<repo-name>/" gesetzt.
const base = process.env.BASE_PATH ?? '/';

// Version für die Download-Seite: Commit (auf GitHub) und Zeitpunkt des Builds
const version = { sha: (process.env.GITHUB_SHA ?? 'lokal').slice(0, 7), time: new Date().toISOString() };

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  // MapLibre (Strassenkarte) ist gross, wird aber erst bei Bedarf nachgeladen
  build: { chunkSizeWarningLimit: 1100 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'SwissCatch – Schweizerkarte',
        short_name: 'SwissCatch',
        description: 'Interaktive Schweizerkarte mit ÖV-Fahrplan und dem grossen Versteckspiel quer durch die Schweiz.',
        lang: 'de-CH',
        theme_color: '#1F1C35',
        background_color: '#1F1C35',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,geojson,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Vektorkacheln, Schriften und Symbole der Strassenkarte
            urlPattern: ({ url }) => /^vectortiles\d*\.geo\.admin\.ch$/.test(url.hostname) && !url.pathname.endsWith('style.json'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'swisstopo-vector',
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Kartenstil: sofort aus dem Cache, im Hintergrund aktualisieren
            urlPattern: ({ url }) => url.hostname === 'vectortiles.geo.admin.ch' && url.pathname.endsWith('style.json'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'swisstopo-styles', cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Kartenkacheln von swisstopo: einmal geladen, offline verfügbar
            urlPattern: ({ url }) => url.hostname === 'wmts.geo.admin.ch',
            handler: 'CacheFirst',
            options: {
              cacheName: 'swisstopo-tiles',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
