"use client";

import { useCallback, useEffect, useState } from "react";
import { getAccount, type AccountInfo } from "./api";

/** The signed-in crew member, or null. `loading` is true until the first answer. */
export function useAccount(apiUrl: string) {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await getAccount(apiUrl);
    setAccount(res.ok ? res.data.account : null);
    setLoading(false);
  }, [apiUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { account, loading, refresh };
}
