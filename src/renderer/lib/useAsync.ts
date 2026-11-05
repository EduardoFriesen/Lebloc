import { type DependencyList, useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> = { status: 'loading' } | { status: 'error'; error: Error } | { status: 'success'; data: T };
export type AsyncResult<T> = AsyncState<T> & { reload: () => void };

export function useAsync<T>(
  load: () => Promise<T>,
  deps: DependencyList,
  options: { keepPreviousData?: boolean } = {},
): AsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const isReload = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // A reload after an action (or a search keystroke) keeps the current data on
    // screen instead of flashing the skeleton.
    if (!isReload.current && !options.keepPreviousData) setState({ status: 'loading' });
    isReload.current = false;
    load().then(
      (data) => {
        if (!cancelled) setState({ status: 'success', data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is a new closure on every render; callers pass its real inputs in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => {
    isReload.current = true;
    setVersion((current) => current + 1);
  }, []);

  return { ...state, reload };
}
