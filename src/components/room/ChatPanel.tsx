import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, ChevronRight, MessageSquare } from "lucide-react";
import { ReactionsBar } from "@/components/room/ReactionsBar";

interface Msg {
  id: string;
  userId: string;
  name: string;
  text: string;
  ts: number;
}

interface Props {
  roomId: string;
  open: boolean;
  onToggle: () => void;
  onActivity?: (text: string) => void;
}

export function ChatPanel({ roomId, open, onToggle }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ch = supabase.channel(`chat-${roomId}`);
    channelRef.current = ch;
    ch.on("broadcast", { event: "msg" }, (p) => {
      setMessages((prev) => [...prev, p.payload as Msg]);
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = () => {
    if (!input.trim() || !user) return;
    const msg: Msg = {
      id: crypto.randomUUID(),
      userId: user.id,
      name: user.email?.split("@")[0] || "User",
      text: input.trim(),
      ts: Date.now(),
    };
    channelRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
    setMessages((p) => [...p, msg]);
    setInput("");
  };

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="flex h-full w-10 flex-col items-center justify-center gap-2 border-l border-border bg-card text-muted-foreground hover:text-foreground"
        title="Open chat"
      >
        <MessageSquare className="h-5 w-5" />
        <span className="text-xs [writing-mode:vertical-rl]">Chat</span>
      </button>
    );
  }

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">Live Chat</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {/* Quick reactions live next to chat where they're most contextually relevant */}
      <div className="border-b border-border px-3 py-2">
        <ReactionsBar roomId={roomId} />
      </div>
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="space-y-3 p-3">
          {messages.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">No messages yet</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-primary">{m.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="break-words rounded-md bg-muted px-2 py-1 text-sm">{m.text}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="flex gap-1 border-t border-border p-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message..."
          className="h-9"
        />
        <Button size="icon" className="h-9 w-9" onClick={send}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
