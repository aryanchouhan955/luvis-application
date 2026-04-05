import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  initialMinutes?: number;
  roomId?: string;
}

export function PomodoroTimer({ initialMinutes = 25, roomId }: Props) {
  const [seconds, setSeconds] = useState(initialMinutes * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isRemoteUpdate = useRef(false);

  // Realtime sync
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`timer-${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "timer-sync" }, (payload) => {
        isRemoteUpdate.current = true;
        setSeconds(payload.payload.seconds);
        setRunning(payload.payload.running);
        setTimeout(() => { isRemoteUpdate.current = false; }, 50);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  useEffect(() => {
    if (running && seconds > 0) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s - 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, seconds]);

  const broadcast = (secs: number, isRunning: boolean) => {
    if (!isRemoteUpdate.current && channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "timer-sync",
        payload: { seconds: secs, running: isRunning },
      });
    }
  };

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
