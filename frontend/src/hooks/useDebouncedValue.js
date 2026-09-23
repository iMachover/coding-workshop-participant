import { useEffect, useState } from 'react'

/**
 * The value, but only after it has stopped changing for `delay` ms. Used so a search
 * box sends one request when typing pauses instead of one per keystroke.
 * @template T
 * @param {T} value
 * @param {number} [delay]
 * @returns {T}
 */
export default function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
