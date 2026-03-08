import { defineConfig, type Plugin } from 'vite'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Grab git SHA and build time at build time
const gitSha = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() }
  catch { return 'unknown' }
})()
const buildTime = new Date().toISOString()

// ---------------------------------------------------------------------------
// Vite plugin: stamp version into sw-push.js after build
// ---------------------------------------------------------------------------
// sw-push.js lives in public/ and gets copied to dist/ as-is by Vite.
// This plugin runs after the build completes and replaces the placeholder
// version strings with the actual git SHA and build time.
// ---------------------------------------------------------------------------
function stampSwVersion(): Plugin {
  return {
    name: 'stamp-sw-version',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist', 'sw-push.js')
      try {
        let content = readFileSync(swPath, 'utf-8')
        content = content
          .replace("const SW_PUSH_VERSION = 'dev'", `const SW_PUSH_VERSION = '${gitSha}'`)
          .replace("const SW_PUSH_BUILD_TIME = 'dev'", `const SW_PUSH_BUILD_TIME = '${buildTime}'`)
        writeFileSync(swPath, content)
      } catch (err) {
        console.warn('Failed to stamp sw-push.js version:', err)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Inject build-time constants accessible via import.meta.env
  define: {
    __BUILD_VERSION__: JSON.stringify(gitSha),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  plugins: [
    react(),
    stampSwVersion(),

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
        // Exclude sw-push.js from precache — it's loaded via importScripts
        // and must always be fetched fresh from the network. If it's precached,
        // service worker updates won't pick up changes to the push handler.
        globIgnores: ['sw-push.js'],
        // Import our push notification handler into the generated service worker.
        // importScripts runs at the top of sw.js, making our push event
        // listeners available alongside workbox's caching logic.
        importScripts: ['sw-push.js'],
        // Force the new service worker to activate immediately instead of
        // waiting for all tabs to close. For ~6 users, we always want the
        // latest code running.
        skipWaiting: true,
        clientsClaim: true,
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
