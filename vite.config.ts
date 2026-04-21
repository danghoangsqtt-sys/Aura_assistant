import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const resolvedApiKey = env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || env.API_KEY || '';

  return {
    base: './',
    plugins: [react()],
    resolve: {
      alias: {
        // Path aliases để import gọn hơn
        // Ví dụ: import { platform } from '@shared/platformBridge'
        '@shared':  path.resolve(__dirname, 'src/shared'),
        '@desktop': path.resolve(__dirname, 'src/desktop'),
        '@webapp':  path.resolve(__dirname, 'src/webapp'),
      }
    },
    define: {
      'process.env.API_KEY': JSON.stringify(resolvedApiKey),
      'process.env': {}
    },
    // Split heavy libraries into dedicated chunks to keep initial app bundle smaller.
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
            if (id.includes('node_modules/framer-motion')) return 'vendor-framer';
            if (id.includes('node_modules/@google/genai')) return 'vendor-genai';
            if (id.includes('node_modules/pixi')) return 'vendor-pixi';
            if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          }
        }
      }
    },
    optimizeDeps: {
      include: ['pixi.js', 'pixi-live2d-display']
    }
  }
})
