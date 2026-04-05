import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";

interface Props {
  initialMinutes?: number;
}

export function PomodoroTimer({ initialMinutes = 25 }: Props) {
  const [seconds, setSeconds] = useState(initialMinutes * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  const reset = () => {
    setRunning(false);
    setSeconds(initialMinutes * 60);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Focus Timer</p>
      <p className="mb-3 text-3xl font-bold font-mono tabular-nums">
        {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
      </p>
      <div className="flex justify-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setRunning(!running)}>
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
