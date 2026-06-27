import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MousePointer2 } from "lucide-react";

interface CursorState {
  userId: string;
  name: string;
  x: number; // 0..1 of container
  y: number;
  ts: number;
}

interface Props {
  roomId: string;
  panel: string; // "whiteboard" | "notepad" | "code"
  enabled: boolean;
  children: React.ReactNode;
}

const COLORS = ["#6C5CE7", "#00B894", "#E17055", "#0984E3", "#FDCB6E", "#E84393"];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function CollabCursors({ roomId, panel, enabled, children }: Props) {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [cursors, setCursors] = useState<Record<string, CursorState>>({});
  const lastSent = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setCursors({});
      return;
    }
    const ch = supabase.channel(`cursors-${roomId}-${panel}`);
    channelRef.current = ch;
    ch.on("broadcast", { event: "cursor" }, (p) => {
      const c = p.payload as CursorState;
      if (c.userId === user?.id) return;
      setCursors((prev) => ({ ...prev, [c.userId]: c }));
    }).on("broadcast", { event: "leave" }, (p) => {
      setCursors((prev) => {
        const n = { ...prev };
        delete n[p.payload.userId];
        return n;
      });
    }).subscribe();

    // Cleanup stale cursors
    const cleanup = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        const next: Record<string, CursorState> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.ts < 5000) next[k] = v;
        }
        return next;
      });
    }, 2000);

    return () => {
      clearInterval(cleanup);
      if (user) ch.send({ type: "broadcast", event: "leave", payload: { userId: user.id } });
      supabase.removeChannel(ch);
    };
  }, [enabled, roomId, panel, user]);

  const handleMove = (e: React.MouseEvent) => {
    if (!enabled || !user) return;
    const now = performance.now();
    if (now - lastSent.current < 50) return;
    lastSent.current = now;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    channelRef.current?.send({
      type: "broadcast",
      event: "cursor",
      payload: {
        userId: user.id,
        name: user.email?.split("@")[0] || "User",
        x, y, ts: Date.now(),
      } as CursorState,
    });
  };

  return (
    <div ref={containerRef} onMouseMove={handleMove} className="relative h-full w-full">
      {children}
      {enabled && (
        <div className="pointer-events-none absolute inset-0 z-30">
          {Object.values(cursors).map((c) => (
            <div
              key={c.userId}
              className="absolute flex items-start gap-1 transition-transform duration-75"
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, color: colorFor(c.userId) }}
            >
              <MousePointer2 className="h-4 w-4 fill-current" />
              <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium" style={{ color: colorFor(c.userId) }}>
                {c.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
