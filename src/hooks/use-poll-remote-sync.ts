import { useEffect, useRef } from "react";
import { syncBlocksFromRemote } from "@/lib/blocks";

const POLL_INTERVAL_MS = 12_000;

/**
 * Polls the shared Supabase backend every ~12s so changes from other devices
 * (a driver marking a stop, someone renaming/deleting a block) show up
 * without a manual refresh. Skips a tick while the tab is hidden, since nothing
 * mobile does in the background should burn battery/data polling.
 */
export function usePollRemoteSync(onChanged: () => void): void {
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      void syncBlocksFromRemote().then((changed) => {
        if (changed) onChangedRef.current();
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}
