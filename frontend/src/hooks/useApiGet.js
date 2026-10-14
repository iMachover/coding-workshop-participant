import { useCallback, useEffect, useState } from 'react';
import { useRefresh } from '../context/useRefresh';
import { request } from '../services/apiClient';

/**
 * Load one API path and keep its data, error and loading state.
 *
 * Changing `path` loads the new one; the previous data stays visible until it arrives.
 * `retry` repeats the request after an error. Any write that calls useRefresh().bump()
 * reloads every path on screen.
 *
 * @param {string|null} path API path, e.g. "/me/overview"; null loads nothing (data stays null)
 * @returns {{ data: any, error: import('../services/apiClient').ApiError|null, loading: boolean, retry: () => void }}
 */
export function useApiGet(path) {
  const { version } = useRefresh();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const key = `${path}#${attempt}#${version}`;

  useEffect(() => {
    if (path === null) return undefined;
    let cancelled = false;
    request(path).then(
      (data) => !cancelled && setResult({ key, data, error: null }),
      (error) => !cancelled && setResult((prev) => ({ key, data: prev.data, error })),
    );
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (path === null) {
    return { data: null, error: null, loading: false, retry };
  }
  const loading = result.key !== key;
  return { data: result.data, error: loading ? null : result.error, loading, retry };
}
