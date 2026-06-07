import { useState, useEffect, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Editor, { OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";

const languages = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
];

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
  const storageKey = `code-${roomId}`;
  const langKey = `code-lang-${roomId}`;
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState(defaultCode);
  const { resolvedTheme } = useTheme();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isRemoteUpdate = useRef(false);

  // Restore from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const savedLang = localStorage.getItem(langKey);
      if (saved !== null) setCode(saved);
      if (savedLang) setLanguage(savedLang);
    } catch {}
  }, [storageKey, langKey]);

  // Autosave
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(storageKey, code); localStorage.setItem(langKey, language); } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [code, language, storageKey, langKey]);

  useEffect(() => {
    const channel = supabase.channel(`code-${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "code-change" }, (payload) => {
        isRemoteUpdate.current = true;
        setCode(payload.payload.code);
        if (payload.payload.language) {
          setLanguage(payload.payload.language);
        }
        setTimeout(() => { isRemoteUpdate.current = false; }, 50);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const handleCodeChange = (value: string | undefined) => {
    const newCode = value ?? "";
    setCode(newCode);
    if (!isRemoteUpdate.current && channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "code-change",
        payload: { code: newCode, language },
      });
    }
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "code-change",
        payload: { code, language: lang },
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
        <Select value={language} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Room: {roomId}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          Live sync
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={handleCodeChange}
          theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
