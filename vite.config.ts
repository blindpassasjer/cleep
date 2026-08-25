import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const isDemo = env.VITE_DEMO === 'true';

  return {
    // The demo build deploys to GitHub Pages as a project site
    // (https://<user>.github.io/cleep/), which serves everything under a /cleep/ subpath instead
    // of the domain root the self-hosted build assumes.
    base: isDemo ? '/cleep/' : '/',
    plugins: [
      react(),
      VitePWA({
          registerType: 'autoUpdate',
          // Registered manually in src/main.tsx (via virtual:pwa-register) so we can force a reload
          // when an update is ready, instead of relying on the plugin's default auto-injected script.
          injectRegister: false,
          includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
          manifest: {
            name: isDemo ? 'Cleep (Demo)' : 'Cleep',
            short_name: 'Cleep',
            description: 'A self-hostable, open-source clone of Google Keep.',
            theme_color: '#ffcc66',
            background_color: '#ffffff',
            display: 'standalone',
            // Must match `base` above -- a project-page demo lives under /cleep/, not the domain root.
            scope: isDemo ? '/cleep/' : '/',
            start_url: isDemo ? '/cleep/' : '/',
            icons: [
              { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
              { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            cleanupOutdatedCaches: true,
            globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
            navigateFallback: isDemo ? '/cleep/index.html' : '/index.html',
            navigateFallbackDenylist: [/^\/api\//],
            runtimeCaching: [
              {
                urlPattern: /\/api\//,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'api-cache',
                  networkTimeoutSeconds: 10,
                  expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
                },
              },
              {
                urlPattern: ({ request }) => request.destination === 'document',
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'html-cache',
                  networkTimeoutSeconds: 3,
                  expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
                },
              },
            ],
          },
          devOptions: {
            enabled: false,
          },
        }),
    ],
    server: {
      proxy: {
        '/api': 'http://localhost:6169',
      },
    },
  };
});
