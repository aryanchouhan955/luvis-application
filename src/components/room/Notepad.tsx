import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  roomId?: string;
}

export function Notepad({ roomId }: Props) {
  const storageKey = `notepad-${roomId || "default"}`;
  const [content, setContent] = useState("");

  useEffect(() => {
    try { setContent(localStorage.getItem(storageKey) || ""); } catch {}
  }, [storageKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(storageKey, content); } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [content, storageKey]);

  return (
    <div className="h-full">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your notes here... (auto-saved)"
        className="h-full min-h-0 resize-none border-0 bg-transparent text-base focus-visible:ring-0"
      />
    </div>
  );
}
