import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),

    // ---------------------------------------------------------------------------
    // VitePWA plugin — turns our React app into a Progressive Web App
    // ---------------------------------------------------------------------------
    // A PWA needs two things to be "installable" (add to home screen):
    //   1. A Web App Manifest (manifest.webmanifest) — metadata like name, icons, colors
    //   2. A Service Worker — a background script that handles caching and push notifications
    //
    // This plugin generates both automatically from the config below.
    // ---------------------------------------------------------------------------
    VitePWA({
      // "registerType: autoUpdate" means when we deploy new code, the service
      // worker automatically activates the new version. The alternative is
      // "prompt" which shows a "new version available" UI, but for a small
      // group of friends, auto-update is simpler.
      registerType: 'autoUpdate',

      // Include these file types in the service worker's precache.
      // Precaching means the service worker downloads and caches these files
      // at install time, so the app works offline immediately.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },

      // The manifest tells the browser how to display the app when installed
      // on a phone or desktop. Without this, the app is just a regular website.
      manifest: {
        name: 'Grimoire — Campaign Companion',
        short_name: 'Grimoire',
        description: 'Campaign companion hub for Pathfinder sessions',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone', // Hides the browser chrome (URL bar, etc.)
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable', // Used on Android for adaptive icons
          },
        ],
      },
    }),
  ],
})
