"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Lokal kopi av data fra serveren for optimistiske oppdateringer.
 *
 * Ny server-data tas bare inn når ingen av våre egne endringer er underveis — ellers
 * ville svaret på endring 1 overskrive de optimistiske endringene 2, 3 … (f.eks. når
 * man krysser av flere varer raskt). Pakk hvert server-kall inn i `track(...)`.
 */
export function useServerState<T>(serverValue: T) {
  const [local, setLocal] = useState(serverValue);
  const pending = useRef(0);
  const latest = useRef(serverValue);

  useEffect(() => {
    latest.current = serverValue;
    if (pending.current === 0) setLocal(serverValue);
  }, [serverValue]);

  const track = useCallback(async <R,>(promise: Promise<R>): Promise<R> => {
    pending.current += 1;
    try {
      return await promise;
    } finally {
      pending.current -= 1;
      if (pending.current === 0) setLocal(latest.current);
    }
  }, []);

  return [local, setLocal, track] as const;
}
