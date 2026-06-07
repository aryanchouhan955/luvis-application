import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const REACTIONS = ["👍", "👏", "🔥", "😂", "❤️"];

interface FloatingReaction {
  id: string;
  emoji: string;
  name: string;
  x: number;
}

interface Props {
  roomId: string;
}

export function ReactionsBar({ roomId }: Props) {
  const { user } = useAuth();
  const [floats, setFloats] = useState<FloatingReaction[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const ch = supabase.channel(`reactions-${roomId}`);
    channelRef.current = ch;
    ch.on("broadcast", { event: "react" }, (p) => {
      const r = p.payload as FloatingReaction;
      setFloats((prev) => [...prev, r]);
      setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== r.id)), 3000);
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomId]);

  const send = (emoji: string) => {
    const r: FloatingReaction = {
      id: crypto.randomUUID(),
      emoji,
      name: user?.email?.split("@")[0] || "User",
      x: 20 + Math.random() * 60,
    };
    channelRef.current?.send({ type: "broadcast", event: "react", payload: r });
    setFloats((prev) => [...prev, r]);
    setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== r.id)), 3000);
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        {floats.map((f) => (
          <div
            key={f.id}
            className="absolute bottom-24 animate-[float-up_3s_ease-out_forwards] text-4xl"
            style={{ left: `${f.x}%` }}
          >
            <div className="flex flex-col items-center">
              <span>{f.emoji}</span>
              <span className="mt-1 rounded-full bg-background/80 px-2 text-[10px] text-foreground">{f.name}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 shadow-sm">
        {REACTIONS.map((e) => (
          <button
            key={e}
            onClick={() => send(e)}
            className="rounded-full px-2 py-0.5 text-lg transition-transform hover:scale-125"
            title={`Send ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <style>{`
        @keyframes float-up {
          0% { transform: translateY(0) scale(0.6); opacity: 0; }
          15% { opacity: 1; transform: translateY(-10px) scale(1); }
          100% { transform: translateY(-400px) scale(1.2); opacity: 0; }
        }
      `}</style>
    </>
  );
}
