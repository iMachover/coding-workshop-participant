import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no matchMedia; MUI and react-responsive expect it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

// React reports bad props, missing keys and similar bugs through console.error.
// Fail the test instead of letting them scroll by.
const originalConsoleError = console.error
console.error = (...args) => {
  originalConsoleError(...args)
  throw new Error(`console.error was called: ${String(args[0]).slice(0, 200)}`)
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
