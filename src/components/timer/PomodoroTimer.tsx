import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  initialMinutes?: number;
  roomId?: string;
  compact?: boolean;
}

export function PomodoroTimer({ initialMinutes = 25, roomId, compact = false }: Props) {
  const [seconds, setSeconds] = useState(initialMinutes * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isRemoteUpdate = useRef(false);

  useEffect(() => {
    setSeconds(initialMinutes * 60);
    setRunning(false);
  }, [initialMinutes]);

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase.channel(`timer-${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "timer-sync" }, (payload) => {
        isRemoteUpdate.current = true;
        setSeconds(payload.payload.seconds);
        setRunning(payload.payload.running);
        window.setTimeout(() => {
          isRemoteUpdate.current = false;
        }, 50);
      })
      .subscribe();

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const broadcast = (secs: number, isRunning: boolean) => {
    if (!isRemoteUpdate.current && channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "timer-sync",
        payload: { seconds: secs, running: isRunning },
      });
    }
  };

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(() => {
      setSeconds((current) => {
        const next = Math.max(0, current - 1);

        if (next === 0) {
          setRunning(false);
          broadcast(0, false);
        }

        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running]);

  const toggle = () => {
    const next = !running;
    setRunning(next);
    broadcast(seconds, next);
  };

  const reset = () => {
    setRunning(false);
    const resetSecs = initialMinutes * 60;
    setSeconds(resetSecs);
    broadcast(resetSecs, false);
  };

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Focus</span>
        <span className="font-mono text-sm font-bold tabular-nums">
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={toggle}>
          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Focus Timer</p>
      <p className="mb-3 text-3xl font-bold font-mono tabular-nums">
        {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
      </p>
      <div className="flex justify-center gap-2">
        <Button size="sm" variant="outline" onClick={toggle}>
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
