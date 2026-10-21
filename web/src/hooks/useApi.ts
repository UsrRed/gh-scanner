import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiGet } from '../api/client';

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  setData: (d: T | null) => void;
}

/** GET `path` (null = idle); reload() relance la requête. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (path === null) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    apiGet<T>(path).then(
      (d) => { if (mine === seq.current) { setData(d); setLoading(false); } },
      (e: unknown) => {
        if (mine !== seq.current) return;
        setError(e instanceof ApiError ? e : new ApiError('internal', String(e)));
        setLoading(false);
      },
    );
    return () => { seq.current++; };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}
