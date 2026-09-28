import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Prively',
        short_name: 'Prively',
        description: 'O teu Privê digital.',
        theme_color: '#10080b',
        background_color: '#10080b',
        display: 'standalone',
        lang: 'pt-MZ',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}']
      }
    })
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { host: '0.0.0.0', port: 4173 }
});