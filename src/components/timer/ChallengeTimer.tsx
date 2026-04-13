import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Timer } from "lucide-react";

interface Props {
  /** Seconds per question */
  timeLimit: number;
  questionIndex: number;
  roomId?: string;
  onTimeUp?: () => void;
}

export function ChallengeTimer({ timeLimit, questionIndex, roomId, onTimeUp }: Props) {
  const [seconds, setSeconds] = useState(timeLimit);
  const intervalRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  // Reset when question changes
  useEffect(() => {
    setSeconds(timeLimit);
  }, [questionIndex, timeLimit]);

  // Auto-start countdown
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = window.setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onTimeUpRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [questionIndex, timeLimit]);

  // Broadcast sync
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`challenge-timer-${roomId}`);
    channelRef.current = channel;
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const pct = (seconds / timeLimit) * 100;
  const isLow = seconds <= 10;

  return (
    <div className={`rounded-xl border border-border bg-card p-4 text-center ${isLow ? "animate-pulse border-destructive" : ""}`}>
      <div className="mb-2 flex items-center justify-center gap-1">
        <Timer className={`h-4 w-4 ${isLow ? "text-destructive" : "text-primary"}`} />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Time Left</p>
      </div>
      <p className={`mb-3 text-3xl font-bold font-mono tabular-nums ${isLow ? "text-destructive" : ""}`}>
        {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
      </p>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isLow ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
