import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

/** Which build this is, shown on the home screen: the commit it was built from and when. */
function buildTag() {
  let sha = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
  if (!sha) {
    try {
      sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      sha = '';
    }
  }
  const at = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  return { id: sha ? `build ${sha.slice(0, 7)}` : 'dev', at: sha ? at : '' };
}

export default defineConfig(({ command }) => ({
  define: {
    __BUILD__: JSON.stringify(command === 'build' ? buildTag() : { id: 'dev', at: '' }),
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Battlebots',
        short_name: 'Battlebots',
        description: 'Auto 1v1 robot boxing arena. Build your bot, watch it fight.',
        theme_color: '#0b0f1a',
        background_color: '#0b0f1a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        categories: ['games'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // commentary clips download as fights need them and stay for good (their names are content hashes)
        globIgnores: ['voice/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/voice/c/'),
            handler: 'CacheFirst',
            options: { cacheName: 'voice', expiration: { maxEntries: 5000 } },
          },
          {
            urlPattern: ({ url }) => url.pathname === '/voice/manifest.json',
            handler: 'NetworkFirst',
            options: { cacheName: 'voice-manifest', networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
}));
