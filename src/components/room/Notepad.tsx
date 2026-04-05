import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

export function Notepad() {
  const [content, setContent] = useState("");

  return (
    <div className="h-full">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your notes here..."
        className="h-full min-h-0 resize-none border-0 bg-transparent text-base focus-visible:ring-0"
      />
    </div>
  );
}
