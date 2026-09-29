import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true,
        suppressWarnings: true
      },
      includeAssets: ['favicon.svg', 'manifest.json'],
      manifest: {
        name: 'منظومة الأستاذ القماش - طلابي',
        short_name: 'منظومة القماش',
        description: 'منظومة إدارة طلاب وسناتر الأستاذ القماش - حضور وغياب وامتحانات ودفع أوفلاين وأونلاين',
        theme_color: '#0d1b3e',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/unpkg\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'unpkg-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  // إعدادات البناء (Build) الخاصة برفع المشروع على Vercel أو أي منصة
  build: {
    outDir: 'dist', // المجلد اللي هيتولد فيه المشروع النهائي
    sourcemap: false, // لتقليل مساحة الملفات المرفوعة
    chunkSizeWarningLimit: 1600, // منع تحذيرات الحجم الكبير
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor'; // تجميع مكتبات خارجية في ملف منفصل لتسريع التحميل
          }
        }
      }
    }
  },

  // إعدادات التطوير المحلي والشبكة الداخلية (Local Network & Hotspot)
  server: {
    host: '0.0.0.0', // يتيح الاتصال من الموبايل عبر الواي فاي أو الهوتسبوت بدون نت
    allowedHosts: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
