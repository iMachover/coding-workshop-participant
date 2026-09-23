import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Local FastAPI backend (see README: uvicorn on port 8000). The end-to-end tests run
// their own backend on another port and point the proxy at it with API_PROXY_TARGET.
const LOCAL_API = process.env.API_PROXY_TARGET ?? 'http://localhost:8000'

/**
 * Split third-party code into its own long-cached files: it changes far less often
 * than the app, so a new deploy only makes browsers re-download the app chunk.
 */
function vendorChunk(id) {
  if (!id.includes('node_modules')) return undefined
  if (/[\\/](@mui|@emotion)[\\/]/.test(id)) return 'mui'
  return 'vendor'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The e2e tests set their own, so they never rewrite the dev server's cache.
  cacheDir: process.env.E2E_VITE_CACHE_DIR ?? 'node_modules/.vite',
  server: {
    port: 3000,
    // The app calls relative /api/core/... URLs. In AWS, CloudFront serves the app and
    // routes /api/core* to the Lambda on the same origin; locally, Vite does the same.
    proxy: {
      '/api': LOCAL_API,
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: vendorChunk },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    // Unit and component tests only; e2e/ holds the Playwright browser tests.
    include: ['src/**/*.test.{js,jsx}'],
    // Full-form tests click through many MUI menus; with coverage on and every file
    // running in parallel, a few exceed the 5s default.
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/test/**', 'src/**/*.test.{js,jsx}'],
    },
  },
})
