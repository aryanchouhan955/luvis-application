import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const languages = ["javascript", "typescript", "python", "java", "cpp", "html", "css"];

const defaultCode = `// Welcome to LUVIS Code Editor
// Start coding collaboratively!

function hello() {
  console.log("Hello, LUVIS!");
}

hello();
`;

interface Props {
  roomId: string;
}

export function CodeEditorPanel({ roomId }: Props) {
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState(defaultCode);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang} value={lang}>{lang}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Room: {roomId}</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="h-full w-full resize-none bg-background p-4 font-mono text-sm focus:outline-none"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
