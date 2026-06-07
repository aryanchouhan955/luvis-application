import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity } from "lucide-react";

export interface ActivityEvent {
  id: string;
  text: string;
  ts: number;
}

interface Props {
  roomId: string;
}

export function ActivityLog({ roomId }: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const ch = supabase.channel(`activity-${roomId}`);
    channelRef.current = ch;
    ch.on("broadcast", { event: "log" }, (p) => {
      setEvents((prev) => [...prev, p.payload as ActivityEvent].slice(-200));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Activity</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1.5 p-3">
          {events.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">No activity yet</p>
          )}
          {events.map((e) => (
            <div key={e.id} className="flex items-baseline gap-2 text-xs">
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="text-foreground">{e.text}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export function logActivity(roomId: string, text: string) {
  const ch = supabase.channel(`activity-${roomId}`);
  const evt: ActivityEvent = { id: crypto.randomUUID(), text, ts: Date.now() };
  ch.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      ch.send({ type: "broadcast", event: "log", payload: evt }).then(() => {
        setTimeout(() => supabase.removeChannel(ch), 500);
      });
    }
  });
}
