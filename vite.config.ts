import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const isDemo = env.VITE_DEMO === 'true';

  // A public URL a dedicated subdomain reverse-proxies straight to this dev server (no path
  // prefix) -- set by `npm run dev:demo`. When present, the demo serves from the domain root,
  // trusts that host, binds a fixed port (so only one project's `dev:demo` can hold it at a
  // time), and points the HMR websocket back through the proxy's TLS.
  const devOrigin = env.VITE_DEV_ORIGIN ? new URL(env.VITE_DEV_ORIGIN) : null;

  // The demo defaults to the /cleep/ subpath (GitHub Pages project site); a root devOrigin or an
  // explicit VITE_DEMO_BASE overrides that. Always ends in a slash so `${base}index.html` and the
  // PWA scope/start_url below stay valid.
  const base = isDemo ? (devOrigin ? '/' : env.VITE_DEMO_BASE || '/cleep/') : '/';

  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:6169';

  // Hosts the dev server will answer to. Explicit list via VITE_ALLOWED_HOSTS, plus the
  // remote API host when proxying to one (it's typically the same hostname the dev server
  // is reached through via a reverse proxy).
  const allowedHosts = [
    ...(env.VITE_ALLOWED_HOSTS ? env.VITE_ALLOWED_HOSTS.split(',').map((h) => h.trim()) : []),
    ...(env.VITE_API_PROXY_TARGET ? [new URL(apiProxyTarget).hostname] : []),
    ...(devOrigin ? [devOrigin.hostname] : []),
  ].filter(Boolean);

  return {
    base,
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
            scope: base,
            start_url: base,
            icons: [
              { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
              { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            cleanupOutdatedCaches: true,
            globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
            navigateFallback: `${base}index.html`,
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
      // Set VITE_ALLOWED_HOSTS (comma-separated) when reaching the dev server through a tunnel or
      // reverse proxy on some other hostname (e.g. a remote VS Code / Codespaces forwarded URL).
      // Unset in normal local use, which keeps Vite's default host checking.
      allowedHosts: allowedHosts.length ? allowedHosts : undefined,
      // 5173 is Vite's default; naming it explicitly lets `dev:demo` claim the one port the
      // test.manriquez.no proxy forwards to. strictPort only under a devOrigin so a plain
      // `npm run dev` still falls through to the next free port as before.
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      strictPort: Boolean(devOrigin),
      ...(devOrigin
        ? {
            hmr: {
              host: devOrigin.hostname,
              protocol: devOrigin.protocol === 'https:' ? 'wss' : 'ws',
              clientPort: devOrigin.port
                ? Number(devOrigin.port)
                : devOrigin.protocol === 'https:'
                  ? 443
                  : 80,
            },
          }
        : {}),
      proxy: {
        // Defaults to the local API server (`npm run server:dev`). Set VITE_API_PROXY_TARGET to
        // develop the frontend against a remote backend instead, e.g.
        // VITE_API_PROXY_TARGET=https://test.manriquez.no
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          // Rewrite the cookie domain so the browser keeps the session cookie on localhost
          // (Secure cookies are still accepted there — localhost is a secure context).
          cookieDomainRewrite: '',
        },
      },
    },
  };
});
