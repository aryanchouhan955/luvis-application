import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useTheme } from "next-themes";
import { X, Save, PanelLeftClose, PanelLeft, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FileExplorer, type RoomFile } from "./FileExplorer";
import { SupabaseYProvider } from "@/lib/yjsSupabaseProvider";

interface Props {
  roomDbId: string | null;
  roomCode: string;
}

const LANG_BY_EXT: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", jsx: "javascript",
  py: "python", java: "java", cpp: "cpp", cc: "cpp", c: "c",
  cs: "csharp", go: "go", rs: "rust", rb: "ruby", php: "php",
  html: "html", css: "css", scss: "scss", json: "json",
  md: "markdown", yml: "yaml", yaml: "yaml", sh: "shell", sql: "sql",
};
const langFromName = (name: string) =>
  LANG_BY_EXT[name.split(".").pop()?.toLowerCase() || ""] || "plaintext";

const PALETTE = ["#6C5CE7", "#00B894", "#E17055", "#0984E3", "#FDCB6E", "#E84393", "#00CEC9"];
const colorFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

interface OpenTab {
  fileId: string;
  name: string;
  language: string;
  doc: Y.Doc;
  provider: SupabaseYProvider;
  text: Y.Text;
  dirty: boolean;
  loaded: boolean;
}

interface RemotePresence {
  userId: string;
  name: string;
  fileName: string;
}

export function IDEPanel({ roomDbId, roomCode }: Props) {
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const [files, setFiles] = useState<RoomFile[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [problems, setProblems] = useState<editor.IMarker[]>([]);
  const [remotePresence, setRemotePresence] = useState<Record<string, RemotePresence>>({});

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const openTabsRef = useRef<OpenTab[]>([]);
  openTabsRef.current = openTabs;

  // --- Load files & subscribe to file-tree changes ---
  useEffect(() => {
    if (!roomDbId) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("room_files")
        .select("id,parent_id,name,kind,language,position")
        .eq("room_id", roomDbId)
        .order("position");
      if (active && data) setFiles(data as RoomFile[]);
    };
    load();

    const ch = supabase
      .channel(`room-files-${roomDbId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_files", filter: `room_id=eq.${roomDbId}` },
        () => load(),
      )
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [roomDbId]);

  // --- Room-level presence: "X is editing Y" ---
  useEffect(() => {
    if (!roomDbId || !user) return;
    const ch = supabase.channel(`ide-presence-${roomDbId}`, {
      config: { presence: { key: user.id } },
    });
    presenceChannelRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, RemotePresence[]>;
      const next: Record<string, RemotePresence> = {};
      Object.entries(state).forEach(([uid, metas]) => {
        if (uid === user.id) return;
        const m = metas[0];
        if (m?.fileName) next[uid] = m;
      });
      setRemotePresence(next);
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ userId: user.id, name: user.email?.split("@")[0] || "User", fileName: "" });
      }
    });
    return () => { supabase.removeChannel(ch); presenceChannelRef.current = null; };
  }, [roomDbId, user]);

  // Update presence with the currently focused file
  useEffect(() => {
    const ch = presenceChannelRef.current;
    if (!ch || !user) return;
    const active = openTabs.find((t) => t.fileId === activeFileId);
    ch.track({
      userId: user.id,
      name: user.email?.split("@")[0] || "User",
      fileName: active?.name || "",
    });
  }, [activeFileId, openTabs, user]);

  // --- Persistence: debounced save of Y.Text content to DB ---
  const queueSave = useMemo(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    return (fileId: string, getText: () => string) => {
      clearTimeout(timers.get(fileId));
      timers.set(
        fileId,
        setTimeout(async () => {
          await supabase
            .from("room_files")
            .update({ content: getText(), updated_by: user?.id })
            .eq("id", fileId);
          setOpenTabs((tabs) =>
            tabs.map((t) => (t.fileId === fileId ? { ...t, dirty: false } : t)),
          );
        }, 1200),
      );
    };
  }, [user?.id]);

  // --- Open a file: create Yjs doc/provider, seed from DB once ---
  const openFile = useCallback(
    async (file: RoomFile) => {
      if (!roomDbId) return;
      const existing = openTabsRef.current.find((t) => t.fileId === file.id);
      if (existing) { setActiveFileId(file.id); return; }
      const doc = new Y.Doc();
      const text = doc.getText("content");
      const provider = new SupabaseYProvider(roomDbId, file.id, doc);
      const tab: OpenTab = {
        fileId: file.id, name: file.name,
        language: file.language || langFromName(file.name),
        doc, provider, text, dirty: false, loaded: false,
      };
      setOpenTabs((tabs) => [...tabs, tab]);
      setActiveFileId(file.id);

      // Seed initial content from DB if Yjs doc still empty after sync window
      setTimeout(async () => {
        if (text.length > 0) {
          setOpenTabs((tabs) => tabs.map((t) => t.fileId === file.id ? { ...t, loaded: true } : t));
          return;
        }
        const { data } = await supabase
          .from("room_files")
          .select("content")
          .eq("id", file.id)
          .maybeSingle();
        if (data?.content && text.length === 0) {
          doc.transact(() => text.insert(0, data.content as string));
        }
        setOpenTabs((tabs) => tabs.map((t) => t.fileId === file.id ? { ...t, loaded: true } : t));
      }, 600);

      // Track dirty + queue save
      text.observe(() => {
        setOpenTabs((tabs) =>
          tabs.map((t) => (t.fileId === file.id ? { ...t, dirty: true } : t)),
        );
        queueSave(file.id, () => text.toString());
      });
    },
    [roomDbId, queueSave],
  );

  // --- Tab close ---
  const closeTab = useCallback((fileId: string) => {
    setOpenTabs((tabs) => {
      const tab = tabs.find((t) => t.fileId === fileId);
      if (tab) tab.provider.destroy();
      const next = tabs.filter((t) => t.fileId !== fileId);
      if (activeFileId === fileId) {
        setActiveFileId(next.length ? next[next.length - 1].fileId : null);
      }
      return next;
    });
  }, [activeFileId]);

  // Cleanup on unmount
  useEffect(() => () => { openTabsRef.current.forEach((t) => t.provider.destroy()); }, []);

  // --- File CRUD ---
  const createNode = async (parentId: string | null, kind: "file" | "folder", name: string) => {
    if (!roomDbId || !user) return;
    const language = kind === "file" ? langFromName(name) : null;
    const { error } = await supabase.from("room_files").insert({
      room_id: roomDbId, parent_id: parentId, name, kind, language,
      content: "", updated_by: user.id,
    });
    if (error) toast.error(error.message);
  };
  const renameNode = async (id: string, newName: string) => {
    await supabase.from("room_files").update({
      name: newName, language: langFromName(newName),
    }).eq("id", id);
    setOpenTabs((tabs) => tabs.map((t) => t.fileId === id ? { ...t, name: newName, language: langFromName(newName) } : t));
  };
  const deleteNode = async (id: string) => {
    closeTab(id);
    await supabase.from("room_files").delete().eq("id", id);
  };
  const moveNode = async (id: string, newParentId: string | null) => {
    await supabase.from("room_files").update({ parent_id: newParentId }).eq("id", id);
  };

  // --- Bind Monaco to the active tab's Y.Text ---
  const activeTab = openTabs.find((t) => t.fileId === activeFileId) || null;

  useEffect(() => {
    if (!activeTab || !editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    monacoRef.current.editor.setModelLanguage(model, activeTab.language);

    bindingRef.current?.destroy();
    bindingRef.current = new MonacoBinding(
      activeTab.text,
      model,
      new Set([editorRef.current]),
      activeTab.provider.awareness,
    );
    // Local awareness identity
    activeTab.provider.awareness.setLocalStateField("user", {
      name: user?.email?.split("@")[0] || "User",
      color: user ? colorFor(user.id) : "#6C5CE7",
    });
    return () => { bindingRef.current?.destroy(); bindingRef.current = null; };
  }, [activeTab?.fileId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEditorMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;
    // Problems panel: collect markers for current model
    const refreshMarkers = () => {
      const model = ed.getModel();
      if (!model) return setProblems([]);
      setProblems(monaco.editor.getModelMarkers({ resource: model.uri }));
    };
    monaco.editor.onDidChangeMarkers(refreshMarkers);
    ed.onDidChangeModel(refreshMarkers);
  };

  const saveActiveNow = async () => {
    if (!activeTab) return;
    const { error } = await supabase
      .from("room_files")
      .update({ content: activeTab.text.toString(), updated_by: user?.id })
      .eq("id", activeTab.fileId);
    if (error) toast.error(error.message);
    else {
      toast.success("Saved");
      setOpenTabs((tabs) => tabs.map((t) => t.fileId === activeTab.fileId ? { ...t, dirty: false } : t));
    }
  };

  const presenceList = Object.values(remotePresence).filter((p) => p.fileName);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-2 py-1.5">
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? "Hide explorer" : "Show explorer"}
        >
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </Button>
        <span className="text-xs text-muted-foreground">Room {roomCode}</span>
        <div className="ml-auto flex items-center gap-2">
          {presenceList.length > 0 && (
            <span className="hidden md:inline text-xs text-muted-foreground truncate max-w-[280px]">
              {presenceList.map((p) => `${p.name} → ${p.fileName}`).join(" · ")}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" /> Live
          </span>
          <Button size="sm" variant="ghost" onClick={saveActiveNow} disabled={!activeTab}>
            <Save className="mr-1 h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <div className="hidden md:flex w-56 shrink-0 border-r border-border">
            <FileExplorer
              files={files}
              activeFileId={activeFileId}
              onOpen={openFile}
              onCreate={createNode}
              onRename={renameNode}
              onDelete={deleteNode}
              onMove={moveNode}
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Tabs */}
          <div className="flex items-center overflow-x-auto border-b border-border bg-card/40">
            {openTabs.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Open a file from the Explorer to start coding.
              </div>
            )}
            {openTabs.map((tab) => (
              <div
                key={tab.fileId}
                onClick={() => setActiveFileId(tab.fileId)}
                className={cn(
                  "group flex shrink-0 items-center gap-2 border-r border-border px-3 py-1.5 text-xs cursor-pointer",
                  activeFileId === tab.fileId ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted/40",
                )}
              >
                <span className="truncate max-w-[140px]">{tab.name}</span>
                {tab.dirty && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                <button
                  className="opacity-60 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.fileId); }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Editor */}
          <div className="relative min-h-0 flex-1">
            {activeTab ? (
              <Editor
                height="100%"
                language={activeTab.language}
                onMount={handleEditorMount}
                theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
                options={{
                  minimap: { enabled: true },
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', monospace",
                  padding: { top: 12 },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  automaticLayout: true,
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  bracketPairColorization: { enabled: true },
                  guides: { bracketPairs: true, indentation: true },
                  tabSize: 2,
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No file open
              </div>
            )}
          </div>

          {/* Problems panel */}
          <div className="border-t border-border bg-card/40">
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40"
              onClick={() => setProblemsOpen((v) => !v)}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Problems
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{problems.length}</span>
              <span className="ml-auto">
                {problemsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </span>
            </button>
            {problemsOpen && (
              <div className="max-h-32 overflow-auto px-3 pb-2 text-xs">
                {problems.length === 0 && <div className="py-2 text-muted-foreground">No problems detected.</div>}
                {problems.map((p, i) => (
                  <div
                    key={i}
                    className="cursor-pointer py-0.5 hover:text-foreground"
                    onClick={() => {
                      editorRef.current?.revealLineInCenter(p.startLineNumber);
                      editorRef.current?.setPosition({ lineNumber: p.startLineNumber, column: p.startColumn });
                      editorRef.current?.focus();
                    }}
                  >
                    <span className={cn(
                      "mr-2 font-mono",
                      p.severity === 8 ? "text-destructive" : p.severity === 4 ? "text-yellow-500" : "text-muted-foreground",
                    )}>
                      [{p.startLineNumber}:{p.startColumn}]
                    </span>
                    {p.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
