import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { MessageSquare } from "lucide-react";

interface Props {
  roomId: string;
}

export function SharedTopicEditor({ roomId }: Props) {
  const [topic, setTopic] = useState("Click to set discussion topic...");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isRemote = useRef(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const channel = supabase.channel(`topic-${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "topic-update" }, (payload) => {
        isRemote.current = true;
        setTopic(payload.payload.topic);
        setTimeout(() => { isRemote.current = false; }, 50);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const handleChange = useCallback((value: string) => {
    setTopic(value);
    if (isRemote.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      channelRef.current?.send({
        type: "broadcast",
        event: "topic-update",
        payload: { topic: value },
      });
    }, 150);
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-1.5">
      <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
      <Input
        value={topic}
        onChange={(e) => handleChange(e.target.value)}
        className="h-7 border-0 bg-transparent p-0 text-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0"
        placeholder="Set discussion topic..."
      />
    </div>
  );
}
