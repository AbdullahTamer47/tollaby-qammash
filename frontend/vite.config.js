import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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

  // إعدادات التطوير المحلي (Local Development)
  server: {
    allowedHosts: ['tollaby.vercel.app'],
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
