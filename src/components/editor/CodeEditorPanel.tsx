import { useState, useEffect, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { toast } from "sonner";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const languages = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "markdown", label: "Markdown" },
];

const defaultCode = `// Welcome to LUVIS Code Editor
// Real-time collaborative coding — VS Code style.

function hello() {
  console.log("Hello, LUVIS!");
}

hello();
`;

interface Props {
  roomId: string;
}

const COLORS = ["#6C5CE7", "#00B894", "#E17055", "#0984E3", "#FDCB6E", "#E84393"];
const colorFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
};

export function CodeEditorPanel({ roomId }: Props) {
  const { user } = useAuth();
  const storageKey = `code-${roomId}`;
  const langKey = `code-lang-${roomId}`;
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState(defaultCode);
  const { resolvedTheme } = useTheme();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isRemoteUpdate = useRef(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const cursorDecorations = useRef<Record<string, string[]>>({});
  const styleElRef = useRef<HTMLStyleElement | null>(null);

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
      .on("broadcast", { event: "cursor" }, (payload) => {
        const { userId, name, line, column } = payload.payload as {
          userId: string; name: string; line: number; column: number;
        };
        if (userId === user?.id) return;
        const editorInstance = editorRef.current;
        const monaco = monacoRef.current;
        if (!editorInstance || !monaco) return;

        const color = colorFor(userId);
        const className = `collab-cursor-${userId.replace(/[^a-z0-9]/gi, "")}`;
        ensureCursorStyle(className, color, name);

        const newDecorations = editorInstance.deltaDecorations(
          cursorDecorations.current[userId] ?? [],
          [
            {
              range: new monaco.Range(line, column, line, column),
              options: {
                className: `${className}-line`,
                beforeContentClassName: `${className}-caret`,
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
              },
            },
          ]
        );
        cursorDecorations.current[userId] = newDecorations;
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user?.id]);

  // Inject scoped CSS for each remote caret (color + name label)
  const ensureCursorStyle = (className: string, color: string, name: string) => {
    if (!styleElRef.current) {
      const el = document.createElement("style");
      document.head.appendChild(el);
      styleElRef.current = el;
    }
    const sheet = styleElRef.current;
    const marker = `/*${className}*/`;
    if (sheet.textContent?.includes(marker)) return;
    sheet.textContent += `
${marker}
.${className}-caret::before {
  content: "";
  display: inline-block;
  width: 2px;
  height: 1em;
  background: ${color};
  margin-right: -2px;
  vertical-align: text-bottom;
}
.${className}-caret::after {
  content: "${name.replace(/"/g, "")}";
  position: absolute;
  background: ${color};
  color: white;
  font-size: 10px;
  padding: 0 4px;
  border-radius: 2px;
  margin-top: -14px;
  white-space: nowrap;
  pointer-events: none;
  transform: translateX(-2px);
}`;
  };

  const handleEditorMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
    editorInstance.onDidChangeCursorPosition((e) => {
      if (!user || !channelRef.current) return;
      channelRef.current.send({
        type: "broadcast",
        event: "cursor",
        payload: {
          userId: user.id,
          name: user.email?.split("@")[0] || "User",
          line: e.position.lineNumber,
          column: e.position.column,
        },
      });
    });
  };

  useEffect(() => {
    return () => {
      if (styleElRef.current) {
        styleElRef.current.remove();
        styleElRef.current = null;
      }
    };
  }, []);

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

  const saveNow = () => {
    try {
      localStorage.setItem(storageKey, code);
      localStorage.setItem(langKey, language);
      toast.success("Code saved locally");
    } catch {
      toast.error("Could not save code");
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
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            Live sync
          </span>
          <Button variant="ghost" size="sm" onClick={saveNow} title="Save code to this device">
            <Save className="mr-1 h-3.5 w-3.5" /> Save
          </Button>
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={handleCodeChange}
          onMount={handleEditorMount}
          theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
          options={{
            minimap: { enabled: true },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            cursorBlinking: "smooth",
            smoothScrolling: true,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            renderWhitespace: "selection",
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}
