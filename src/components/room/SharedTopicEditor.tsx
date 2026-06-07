import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

interface Props {
  roomId: string;
  onChangeNotify?: (topic: string) => void;
}

export function SharedTopicEditor({ roomId, onChangeNotify }: Props) {
  const [topic, setTopic] = useState("Discussion Topic");
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
      onChangeNotify?.(value);
    }, 300);
  }, [onChangeNotify]);

  return (
    <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-gradient-to-r from-primary/10 via-card to-card px-4 py-3 shadow-sm">
      <div className="h-8 w-1 rounded-full bg-primary" />
      <Input
        value={topic}
        onChange={(e) => handleChange(e.target.value)}
        className="h-auto border-0 bg-transparent p-0 text-xl font-bold tracking-tight text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 md:text-2xl"
        placeholder="Set discussion topic..."
      />
    </div>
  );
}
