import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks active time spent on the page where this hook is mounted (e.g. Study Room),
 * and flushes the elapsed minutes to the backend periodically and on unmount.
 *
 * - Pauses when the tab is hidden.
 * - Flushes every 60s and on cleanup.
 */
export function useStudyTracker(enabled: boolean = true) {
  const accumulatedMs = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const pendingFractionRef = useRef(0); // sub-minute leftover

  useEffect(() => {
    if (!enabled) return;

    const start = () => {
      if (lastTickRef.current === null && document.visibilityState === "visible") {
        lastTickRef.current = Date.now();
      }
    };
    const stop = () => {
      if (lastTickRef.current !== null) {
        accumulatedMs.current += Date.now() - lastTickRef.current;
        lastTickRef.current = null;
      }
    };

    const flush = async () => {
      stop();
      const totalMinutes = accumulatedMs.current / 60000 + pendingFractionRef.current;
      const whole = Math.floor(totalMinutes);
      pendingFractionRef.current = totalMinutes - whole;
      accumulatedMs.current = 0;
      if (whole > 0) {
        try {
          await supabase.rpc("record_study_minutes", { _minutes: whole });
        } catch (e) {
          // swallow — will retry on next flush
          console.warn("record_study_minutes failed", e);
        }
      }
      start();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(flush, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
      // final flush
      stop();
      const totalMinutes = accumulatedMs.current / 60000 + pendingFractionRef.current;
      const whole = Math.floor(totalMinutes);
      if (whole > 0) {
        supabase.rpc("record_study_minutes", { _minutes: whole }).catch(() => {});
      }
    };
  }, [enabled]);
}
