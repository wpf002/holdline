"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getAccount, type AccountInfo } from "./api";

/**
 * One shared read of /auth/me for the whole page. The nav, the bid builder and the account panel
 * all want the signed-in crew member, and four components asking separately meant four requests.
 */
type State = { account: AccountInfo | null; loading: boolean };

const LOADING: State = { account: null, loading: true };
let state: State = LOADING;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function load(apiUrl: string): Promise<void> {
  inFlight ??= getAccount(apiUrl)
    .then((res) => publish({ account: res.ok ? res.data.account : null, loading: false }))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Drops the cached answer, so the next read asks the API again. Call it after signing in or out. */
export function forgetAccount() {
  inFlight = null;
  publish(LOADING);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The signed-in crew member, or null. `loading` is true until the first answer. */
export function useAccount(apiUrl: string) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => LOADING,
  );

  const refresh = useCallback(async () => {
    inFlight = null;
    await load(apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    if (state.loading) void load(apiUrl);
  }, [apiUrl]);

  return { ...snapshot, refresh };
}
