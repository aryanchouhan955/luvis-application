import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { toast } from "sonner";

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

  const saveNow = () => {
    try {
      localStorage.setItem(storageKey, content);
      toast.success("Notes saved locally");
    } catch {
      toast.error("Could not save notes");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <span className="text-xs text-muted-foreground">Auto-saved to this device</span>
        <Button variant="ghost" size="sm" onClick={saveNow} title="Save notes to this device">
          <Save className="mr-1 h-3.5 w-3.5" /> Save
        </Button>
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your notes here... (auto-saved)"
        className="h-full min-h-0 flex-1 resize-none border-0 bg-transparent text-base focus-visible:ring-0"
      />
    </div>
  );
}
