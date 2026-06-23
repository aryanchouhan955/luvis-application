import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useTheme } from "next-themes";
import {
  X, Save, PanelLeftClose, PanelLeft, AlertCircle,
  ChevronDown, ChevronUp, Terminal as TerminalIcon, Play, Trash2, HardDrive,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FileExplorer, type RoomFile, type LocalNode } from "./FileExplorer";
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
  txt: "plaintext",
};
const langFromName = (name: string) =>
  LANG_BY_EXT[name.split(".").pop()?.toLowerCase() || ""] || "plaintext";

const PALETTE = ["#6C5CE7", "#00B894", "#E17055", "#0984E3", "#FDCB6E", "#E84393", "#00CEC9"];
const colorFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

interface RoomTab {
  source: "room";
  fileId: string;
  name: string;
  language: string;
  doc: Y.Doc;
  provider: SupabaseYProvider;
  text: Y.Text;
  dirty: boolean;
  loaded: boolean;
}

interface LocalTab {
  source: "local";
  fileId: string; // path id
  name: string;
  language: string;
  handle: FileSystemFileHandle;
  content: string;
  dirty: boolean;
}

type OpenTab = RoomTab | LocalTab;

interface RemotePresence {
  userId: string;
  name: string;
  fileName: string;
}

// ---------- File System Access helpers ----------
async function readDirRecursive(
  dirHandle: FileSystemDirectoryHandle,
  path = ""
): Promise<LocalNode> {
  const children: LocalNode[] = [];
  // @ts-ignore - values() is supported but TS lib may not include it
  for await (const entry of (dirHandle as any).values()) {
    const childPath = `${path}/${entry.name}`;
    if (entry.kind === "directory") {
      children.push(await readDirRecursive(entry as FileSystemDirectoryHandle, childPath));
    } else {
      children.push({
        id: childPath,
        name: entry.name,
        kind: "file",
        handle: entry as FileSystemFileHandle,
      });
    }
  }
  children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return {
    id: path || `/${dirHandle.name}`,
    name: dirHandle.name,
    kind: "folder",
    handle: dirHandle,
    children,
  };
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

  // Terminal state
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalLines, setTerminalLines] = useState<{ kind: "in" | "out" | "err"; text: string }[]>([
    { kind: "out", text: "LUVIS Sandbox Terminal — JavaScript only. Type `help` for commands." },
  ]);
  const [terminalInput, setTerminalInput] = useState("");
  const terminalScrollRef = useRef<HTMLDivElement>(null);

  // Local folder
  const [localRoot, setLocalRoot] = useState<LocalNode | null>(null);

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

  // --- Room-level presence ---
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

  // --- Persistence: debounced save of Y.Text content ---
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

  // --- Open a collaborative room file ---
  const openFile = useCallback(
    async (file: RoomFile) => {
      if (!roomDbId) return;
      const existing = openTabsRef.current.find((t) => t.fileId === file.id);
      if (existing) { setActiveFileId(file.id); return; }
      const doc = new Y.Doc();
      const text = doc.getText("content");
      const provider = new SupabaseYProvider(roomDbId, file.id, doc);
      const tab: RoomTab = {
        source: "room",
        fileId: file.id, name: file.name,
        language: file.language || langFromName(file.name),
        doc, provider, text, dirty: false, loaded: false,
      };
      setOpenTabs((tabs) => [...tabs, tab]);
      setActiveFileId(file.id);

      setTimeout(async () => {
        if (text.length > 0) {
          setOpenTabs((tabs) => tabs.map((t) => t.fileId === file.id && t.source === "room" ? { ...t, loaded: true } : t));
          return;
        }
        const { data } = await supabase
          .from("room_files").select("content").eq("id", file.id).maybeSingle();
        if (data?.content && text.length === 0) {
          doc.transact(() => text.insert(0, data.content as string));
        }
        setOpenTabs((tabs) => tabs.map((t) => t.fileId === file.id && t.source === "room" ? { ...t, loaded: true } : t));
      }, 600);

      text.observe(() => {
        setOpenTabs((tabs) =>
          tabs.map((t) => (t.fileId === file.id ? { ...t, dirty: true } : t)),
        );
        queueSave(file.id, () => text.toString());
      });
    },
    [roomDbId, queueSave],
  );

  // --- Open a local file (FSA) ---
  const openLocalFile = useCallback(async (node: LocalNode) => {
    if (node.kind !== "file") return;
    const existing = openTabsRef.current.find((t) => t.fileId === node.id);
    if (existing) { setActiveFileId(node.id); return; }
    try {
      const handle = node.handle as FileSystemFileHandle;
      const file = await handle.getFile();
      const content = await file.text();
      const tab: LocalTab = {
        source: "local",
        fileId: node.id,
        name: node.name,
        language: langFromName(node.name),
        handle,
        content,
        dirty: false,
      };
      setOpenTabs((tabs) => [...tabs, tab]);
      setActiveFileId(node.id);
    } catch (e: any) {
      toast.error(`Cannot open file: ${e.message || e}`);
    }
  }, []);

  // --- Tab close ---
  const closeTab = useCallback((fileId: string) => {
    setOpenTabs((tabs) => {
      const tab = tabs.find((t) => t.fileId === fileId);
      if (tab && tab.source === "room") tab.provider.destroy();
      const next = tabs.filter((t) => t.fileId !== fileId);
      if (activeFileId === fileId) {
        setActiveFileId(next.length ? next[next.length - 1].fileId : null);
      }
      return next;
    });
  }, [activeFileId]);

  useEffect(() => () => {
    openTabsRef.current.forEach((t) => { if (t.source === "room") t.provider.destroy(); });
  }, []);

  // --- File CRUD (collaborative) ---
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

  // --- Local folder operations ---
  const refreshLocalRoot = useCallback(async (dir: FileSystemDirectoryHandle) => {
    try {
      const tree = await readDirRecursive(dir);
      setLocalRoot(tree);
    } catch (e: any) {
      toast.error(`Cannot read folder: ${e.message || e}`);
    }
  }, []);

  const onOpenLocalFolder = useCallback(async () => {
    // @ts-expect-error - showDirectoryPicker may not be in TS lib
    if (!window.showDirectoryPicker) {
      toast.error("Your browser does not support the File System Access API.");
      return;
    }
    try {
      // @ts-expect-error - showDirectoryPicker
      const dir: FileSystemDirectoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      // Request permission upfront
      // @ts-expect-error - permissions API
      const perm = await dir.requestPermission?.({ mode: "readwrite" });
      if (perm && perm !== "granted") {
        toast.error("Read/write permission denied");
        return;
      }
      await refreshLocalRoot(dir);
      toast.success(`Opened folder: ${dir.name}`);
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error(`Failed to open folder: ${e.message || e}`);
    }
  }, [refreshLocalRoot]);

  const onCloseLocalFolder = useCallback(() => {
    // Close any local tabs
    setOpenTabs((tabs) => tabs.filter((t) => t.source !== "local"));
    setLocalRoot(null);
  }, []);

  const onCreateLocal = useCallback(async (parent: LocalNode | null, kind: "file" | "folder", name: string) => {
    if (!parent || parent.kind !== "folder") return;
    try {
      const dir = parent.handle as FileSystemDirectoryHandle;
      if (kind === "file") {
        await dir.getFileHandle(name, { create: true });
      } else {
        await dir.getDirectoryHandle(name, { create: true });
      }
      if (localRoot) {
        await refreshLocalRoot(localRoot.handle as FileSystemDirectoryHandle);
      }
    } catch (e: any) {
      toast.error(`Create failed: ${e.message || e}`);
    }
  }, [localRoot, refreshLocalRoot]);

  // --- Active tab + Monaco binding ---
  const activeTab = openTabs.find((t) => t.fileId === activeFileId) || null;

  useEffect(() => {
    if (!activeTab || !editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    monacoRef.current.editor.setModelLanguage(model, activeTab.language);

    // Tear down any prior binding
    bindingRef.current?.destroy();
    bindingRef.current = null;

    if (activeTab.source === "room") {
      // Set model value empty; binding will populate from Yjs
      bindingRef.current = new MonacoBinding(
        activeTab.text,
        model,
        new Set([editorRef.current]),
        activeTab.provider.awareness,
      );
      activeTab.provider.awareness.setLocalStateField("user", {
        name: user?.email?.split("@")[0] || "User",
        color: user ? colorFor(user.id) : "#6C5CE7",
      });
    } else {
      // Local file: set model content from disk snapshot
      model.setValue(activeTab.content);
    }

    return () => { bindingRef.current?.destroy(); bindingRef.current = null; };
  }, [activeTab?.fileId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track local file edits as dirty
  useEffect(() => {
    if (!activeTab || activeTab.source !== "local" || !editorRef.current) return;
    const ed = editorRef.current;
    const model = ed.getModel();
    if (!model) return;
    const sub = model.onDidChangeContent(() => {
      const next = model.getValue();
      setOpenTabs((tabs) => tabs.map((t) => t.fileId === activeTab.fileId && t.source === "local"
        ? { ...t, content: next, dirty: true } : t));
    });
    return () => sub.dispose();
  }, [activeTab?.fileId, activeTab?.source]);

  const handleEditorMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;
    const refreshMarkers = () => {
      const model = ed.getModel();
      if (!model) return setProblems([]);
      setProblems(monaco.editor.getModelMarkers({ resource: model.uri }));
    };
    monaco.editor.onDidChangeMarkers(refreshMarkers);
    ed.onDidChangeModel(refreshMarkers);

    // Ctrl/Cmd+S manual save
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveActiveNow();
    });
  };

  const saveActiveNow = async () => {
    const tab = openTabsRef.current.find((t) => t.fileId === activeFileId);
    if (!tab) return;
    if (tab.source === "room") {
      const { error } = await supabase
        .from("room_files")
        .update({ content: tab.text.toString(), updated_by: user?.id })
        .eq("id", tab.fileId);
      if (error) toast.error(error.message);
      else {
        toast.success("Saved");
        setOpenTabs((tabs) => tabs.map((t) => t.fileId === tab.fileId ? { ...t, dirty: false } : t));
      }
    } else {
      try {
        const w = await tab.handle.createWritable();
        await w.write(tab.content);
        await w.close();
        toast.success("Saved to disk");
        setOpenTabs((tabs) => tabs.map((t) => t.fileId === tab.fileId ? { ...t, dirty: false } : t));
      } catch (e: any) {
        toast.error(`Save failed: ${e.message || e}`);
      }
    }
  };

  // --- Terminal: sandboxed JS execution ---
  const appendOut = (kind: "in" | "out" | "err", text: string) =>
    setTerminalLines((ls) => [...ls, { kind, text }]);

  const runInSandbox = (code: string): Promise<void> =>
    new Promise((resolve) => {
      // Spin up a worker from a Blob so it has no DOM/fetch access by default,
      // and terminate it after a hard timeout.
      const workerCode = `
        const logs = [];
        const send = (kind, args) => {
          self.postMessage({ kind, text: args.map(a => {
            try { return typeof a === "string" ? a : JSON.stringify(a); } catch { return String(a); }
          }).join(" ") });
        };
        const console = {
          log: (...a) => send("out", a),
          info: (...a) => send("out", a),
          warn: (...a) => send("err", a),
          error: (...a) => send("err", a),
        };
        // Remove powerful globals
        try { self.fetch = undefined; } catch(e) {}
        try { self.XMLHttpRequest = undefined; } catch(e) {}
        try { self.importScripts = undefined; } catch(e) {}
        self.onmessage = (e) => {
          try {
            const result = (new Function("console", "return (async()=>{" + e.data + "})()"))(console);
            Promise.resolve(result).then(
              (v) => { if (v !== undefined) send("out", [v]); self.postMessage({ kind: "done" }); },
              (err) => { send("err", [String(err)]); self.postMessage({ kind: "done" }); }
            );
          } catch (err) {
            send("err", [String(err)]);
            self.postMessage({ kind: "done" });
          }
        };
      `;
      const blob = new Blob([workerCode], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      const timeout = setTimeout(() => {
        appendOut("err", "[timeout] execution exceeded 5s — terminated");
        worker.terminate(); URL.revokeObjectURL(url); resolve();
      }, 5000);
      worker.onmessage = (e) => {
        const { kind, text } = e.data;
        if (kind === "done") {
          clearTimeout(timeout);
          worker.terminate(); URL.revokeObjectURL(url); resolve();
        } else {
          appendOut(kind, text);
        }
      };
      worker.onerror = (e) => {
        appendOut("err", e.message);
        clearTimeout(timeout);
        worker.terminate(); URL.revokeObjectURL(url); resolve();
      };
      worker.postMessage(code);
    });

  const handleTerminalSubmit = async () => {
    const cmd = terminalInput.trim();
    if (!cmd) return;
    appendOut("in", `$ ${cmd}`);
    setTerminalInput("");
    if (cmd === "help") {
      appendOut("out", "Commands: help, clear, run (executes current file), or any JS expression.");
      return;
    }
    if (cmd === "clear") { setTerminalLines([]); return; }
    if (cmd === "run") {
      if (!activeTab) { appendOut("err", "No file open."); return; }
      const code = activeTab.source === "room" ? activeTab.text.toString() : activeTab.content;
      const lang = activeTab.language;
      if (lang !== "javascript" && lang !== "typescript") {
        appendOut("err", `Cannot run ${lang} in sandbox. Only JavaScript is supported.`);
        return;
      }
      await runInSandbox(code);
      return;
    }
    await runInSandbox(cmd);
  };

  const runActiveFile = async () => {
    if (!activeTab) return;
    if (!terminalOpen) setTerminalOpen(true);
    const code = activeTab.source === "room" ? activeTab.text.toString() : activeTab.content;
    if (activeTab.language !== "javascript" && activeTab.language !== "typescript") {
      appendOut("err", `Cannot run ${activeTab.language} in sandbox.`);
      return;
    }
    appendOut("in", `$ run ${activeTab.name}`);
    await runInSandbox(code);
  };

  useEffect(() => {
    terminalScrollRef.current?.scrollTo({ top: terminalScrollRef.current.scrollHeight });
  }, [terminalLines, terminalOpen]);

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
          <Button size="sm" variant="ghost" onClick={runActiveFile} disabled={!activeTab}
            title="Run current file (JS sandbox)">
            <Play className="mr-1 h-3.5 w-3.5" /> Run
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setTerminalOpen((v) => !v)} title="Toggle terminal">
            <TerminalIcon className="mr-1 h-3.5 w-3.5" /> Terminal
          </Button>
          <Button size="sm" variant="ghost" onClick={saveActiveNow} disabled={!activeTab}>
            <Save className="mr-1 h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <div className="hidden md:flex w-60 shrink-0 border-r border-border">
            <FileExplorer
              files={files}
              activeFileId={activeFileId}
              onOpen={openFile}
              onCreate={createNode}
              onRename={renameNode}
              onDelete={deleteNode}
              onMove={moveNode}
              localRoot={localRoot}
              onOpenLocalFolder={onOpenLocalFolder}
              onOpenLocalFile={openLocalFile}
              onCreateLocal={onCreateLocal}
              onCloseLocalFolder={onCloseLocalFolder}
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
                {tab.source === "local" && <HardDrive className="h-3 w-3 text-muted-foreground" />}
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
                  folding: true,
                  lineNumbers: "on",
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No file open
              </div>
            )}
          </div>

          {/* Terminal panel */}
          {terminalOpen && (
            <div className="flex h-48 flex-col border-t border-border bg-black/95 text-green-300">
              <div className="flex items-center gap-2 border-b border-border bg-card/40 px-3 py-1 text-xs text-muted-foreground">
                <TerminalIcon className="h-3.5 w-3.5" />
                <span>Terminal (sandboxed JS)</span>
                <span className="ml-auto flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" title="Clear"
                    onClick={() => setTerminalLines([])}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" title="Close"
                    onClick={() => setTerminalOpen(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </span>
              </div>
              <div ref={terminalScrollRef} className="flex-1 overflow-auto px-3 py-2 font-mono text-xs">
                {terminalLines.map((l, i) => (
                  <div key={i} className={cn(
                    "whitespace-pre-wrap",
                    l.kind === "in" && "text-primary",
                    l.kind === "err" && "text-destructive",
                  )}>{l.text}</div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-border bg-black/80 px-3 py-1.5 font-mono text-xs">
                <span className="text-primary">$</span>
                <input
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleTerminalSubmit(); }}
                  placeholder="run | clear | help | <js expression>"
                  className="flex-1 bg-transparent text-green-200 outline-none placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
          )}

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
