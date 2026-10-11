import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Für GitHub Pages wird BASE_PATH auf "/<repo-name>/" gesetzt.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'SwissCatch – Schweizerkarte',
        short_name: 'SwissCatch',
        description: 'Interaktive Schweizerkarte – die Basis für das grosse Fangen quer durch die Schweiz.',
        lang: 'de-CH',
        theme_color: '#D52B1E',
        background_color: '#f4f1ec',
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
        globPatterns: ['**/*.{js,css,html,svg,png,geojson}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
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
