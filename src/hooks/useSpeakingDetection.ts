import { useEffect, useRef, useState } from "react";

/**
 * Returns true when audio level on the stream exceeds a threshold.
 */
export function useSpeakingDetection(stream: MediaStream | null, enabled: boolean = true): boolean {
  const [speaking, setSpeaking] = useState(false);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !enabled) {
      setSpeaking(false);
      return;
    }
    const audioTracks = stream.getAudioTracks().filter((t) => t.enabled && t.readyState === "live");
    if (audioTracks.length === 0) {
      setSpeaking(false);
      return;
    }

    let cancelled = false;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastChange = 0;
      const tick = () => {
        if (cancelled || !analyser) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        const isSpeaking = avg > 18;
        const now = performance.now();
        setSpeaking((prev) => {
          if (prev !== isSpeaking && now - lastChange > 150) {
            lastChange = now;
            return isSpeaking;
          }
          return prev;
        });
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn("Speaking detection failed", e);
    }

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { source?.disconnect(); } catch {}
      try { analyser?.disconnect(); } catch {}
      try { ctxRef.current?.close(); } catch {}
      ctxRef.current = null;
    };
  }, [stream, enabled]);

  return speaking;
}
