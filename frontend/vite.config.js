import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Local FastAPI backend (see README: uvicorn on port 8000).
const LOCAL_API = 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // The app calls relative /api/core/... URLs. In AWS, CloudFront serves the app and
    // routes /api/core* to the Lambda on the same origin; locally, Vite does the same.
    proxy: {
      '/api': LOCAL_API,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/test/**', 'src/**/*.test.{js,jsx}'],
    },
  },
})
