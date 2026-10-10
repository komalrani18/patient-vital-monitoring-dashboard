import { useEffect, useState } from 'react';

/**
 * Runs `fetcher(params, signal)` whenever `params` (compared by VALUE) or `reloadKey` changes.
 *
 * - Aborts the in-flight request when inputs change, so a slow response for the old ward can
 *   never land after, and overwrite, the response for the new one.
 * - Keeps the previous data on screen while the next request loads, so the layout doesn't jump.
 */
export function useApi(fetcher, params, reloadKey = 0) {
  const [state, setState] = useState({ status: 'loading', data: null, meta: null, error: null });
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    fetcher(JSON.parse(paramsKey), controller.signal)
      .then(({ data, meta }) => setState({ status: 'ready', data, meta, error: null }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: 'error', data: null, meta: null, error: err.message });
      });

    return () => controller.abort();
  }, [fetcher, paramsKey, reloadKey]);

  return state;
}
