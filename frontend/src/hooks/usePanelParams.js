import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL keys of the side panels, in the order they stack. The first three nest
 * (project → milestone → task); `person` (profile) and `team` (employee's team) stand alone.
 * `team` comes after them so opening a project from the team panel replaces it; `log` (log hours,
 * `?log=<task id>` or `?log=0` to pick the task) is last so it can open on top of anything.
 */
export const PANEL_KEYS = ['selected', 'milestone', 'task', 'person', 'team', 'log'];

/**
 * The side panels live in the URL (`?selected=<project>&milestone=<id>&task=<id>&person=<id>&team=<id>&log=<task>`)
 * so any page can open one with a plain link and the browser back button closes it.
 *
 * @returns {{ ids: {selected: number|null, milestone: number|null, task: number|null, person: number|null, team: number|null, log: number|null},
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
