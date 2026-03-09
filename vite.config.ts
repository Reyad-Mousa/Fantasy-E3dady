import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: 'Fantasy E3DADY',
          short_name: 'Fantasy E3DADY',
          description: 'نظام إدارة المسابقات بين الفرق',
          theme_color: '#0f0e2a',
          background_color: '#0f0e2a',
          display: 'standalone',
          dir: 'rtl',
          lang: 'ar',
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,ico,png,svg,woff2,json,webmanifest}'],
          navigateFallbackDenylist: [/^\/.*/],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'app-pages-cache',
                networkTimeoutSeconds: 5,
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      minify: 'terser',
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/xlsx-js-style')) {
              return 'xlsx-style';
            }
            if (id.includes('node_modules/xlsx')) {
              return 'xlsx';
            }
            if (id.includes('node_modules/recharts')) {
              return 'charts';
            }
            if (id.includes('node_modules/firebase')) {
              return 'firebase';
            }
            if (
              id.includes('/src/components/HomeStageStatsChart') ||
              id.includes('/src/components/HomeMassTasks') ||
              id.includes('/src/components/RoleActions') ||
              id.includes('/src/components/TeamMembersModal') ||
              id.includes('/src/components/MemberScoreDetailsModal')
            ) {
              return 'home-deferred';
            }
            if (
              id.includes('/src/components/SuperAdminPanel') ||
              id.includes('/src/components/AdminOverviewTab') ||
              id.includes('/src/components/AdminTeamsTab') ||
              id.includes('/src/components/AdminUsersTab') ||
              id.includes('/src/components/AdminReportsTab')
            ) {
              return 'admin';
            }
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
