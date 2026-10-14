import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** URL keys of the stacked side panels, in the order they open. */
export const PANEL_KEYS = ['selected', 'milestone', 'task'];

/**
 * The side panels live in the URL (`?selected=<project>&milestone=<id>&task=<id>`) so any
 * page can open one with a plain link and the browser back button closes it.
 *
 * @returns {{ ids: {selected: number|null, milestone: number|null, task: number|null},
 *             open: (key: string, id: number) => void, close: (key: string) => void }}
 */
export function usePanelParams() {
  const [params, setParams] = useSearchParams();
  const ids = Object.fromEntries(PANEL_KEYS.map((key) => [key, params.get(key) ? Number(params.get(key)) : null]));

  const open = useCallback(
    (key, id) => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.set(key, String(id));
        // Opening a lower panel closes any panel stacked above it.
        PANEL_KEYS.slice(PANEL_KEYS.indexOf(key) + 1).forEach((above) => next.delete(above));
        return next;
      });
    },
    [setParams],
  );

  const close = useCallback(
    (key) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          PANEL_KEYS.slice(PANEL_KEYS.indexOf(key)).forEach((above) => next.delete(above));
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { ids, open, close };
}
