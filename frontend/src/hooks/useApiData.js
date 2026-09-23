import { useCallback, useEffect, useState } from 'react'

/**
 * Load data with `fetcher(params, {signal})`, re-fetching when params change.
 * A newer request cancels the older one, so a slow response can never overwrite
 * a newer result. While re-fetching, the previous data stays available.
 *
 * @template T
 * @param {(params: object, options: {signal: AbortSignal}) => Promise<T>} fetcher
 *   a stable (module-level) function
 * @param {object} [params] compared by value
 * @param {{skip?: boolean}} [options] skip: don't load yet (e.g. no building chosen)
 * @returns {{data: T | undefined, loading: boolean, error: Error | null, reload: () => void}}
 */
export default function useApiData(fetcher, params = {}, { skip = false } = {}) {
  const [attempt, setAttempt] = useState(0)
  const paramsJson = JSON.stringify(params)
  const requestKey = `${attempt}|${paramsJson}`
  // Which request this result belongs to; loading is "the latest request isn't back yet".
  const [result, setResult] = useState({ key: null, data: undefined, error: null })

  useEffect(() => {
    if (skip) return undefined
    const key = `${attempt}|${paramsJson}`
    const controller = new AbortController()
    fetcher(JSON.parse(paramsJson), { signal: controller.signal })
      .then((data) => setResult({ key, data, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setResult({ key, data: undefined, error })
      })
    return () => controller.abort()
  }, [fetcher, attempt, paramsJson, skip])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  if (skip) return { data: undefined, loading: false, error: null, reload }
  return {
    data: result.data,
    loading: result.key !== requestKey,
    error: result.key === requestKey ? result.error : null,
    reload,
  }
}
