import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useTheme } from "next-themes";
import {
  X, Download, PanelLeftClose, PanelLeft, AlertCircle,
  ChevronDown, ChevronUp, Terminal as TerminalIcon, Play, Trash2, FolderArchive,
  Loader2,
} from "lucide-react";
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

// ─── Language detection ───────────────────────────────────────────────────────
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

// ─── Presence palette ─────────────────────────────────────────────────────────
const PALETTE = ["#6C5CE7", "#00B894", "#E17055", "#0984E3", "#FDCB6E", "#E84393", "#00CEC9", "#A29BFE", "#55EFC4"];
const colorFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface RoomTab {
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
  color: string;
  fileName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildFilePath(files: RoomFile[], fileId: string): string {
  const map = new Map(files.map((f) => [f.id, f]));
  const parts: string[] = [];
  let current = map.get(fileId);
  while (current) {
    parts.unshift(current.name);
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }
  return parts.join("/") || "unknown";
}

// Binary file extensions to skip during folder upload
const BINARY_EXTS = new Set([
  "png","jpg","jpeg","gif","bmp","webp","ico","svg",
  "mp4","mp3","wav","ogg","webm","mov","avi",
  "pdf","zip","tar","gz","7z","rar",
  "ttf","woff","woff2","eot",
  "exe","dll","so","dylib","bin","dat",
  "node","lock","lockb",
]);
const isBinary = (name: string) => BINARY_EXTS.has(name.split(".").pop()?.toLowerCase() || "");
const MAX_FILE_SIZE = 500 * 1024; // 500 KB per file

// ─── Download all workspace files as ZIP ─────────────────────────────────────
// Downloads ALL files from the room_files table, not just open tabs,
// so every participant gets the same state.
async function downloadWorkspaceZip(roomDbId: string, files: RoomFile[], roomCode: string) {
  const toastId = toast.loading("Building ZIP…");
  try {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    // Fetch content for all files (not folders) in one batch
    const fileRows = files.filter((f) => f.kind === "file");
    if (fileRows.length === 0) {
      toast.dismiss(toastId);
      toast.error("Workspace has no files to download.");
      return;
    }

    // Batch-fetch content from Supabase
    const { data, error } = await supabase
      .from("room_files")
      .select("id,content")
      .eq("room_id", roomDbId)
      .eq("kind", "file");
    if (error) throw error;

    const contentMap = new Map((data || []).map((r: { id: string; content: string | null }) => [r.id, r.content ?? ""]));

    let count = 0;
    for (const f of fileRows) {
      const path = buildFilePath(files, f.id);
      const content = contentMap.get(f.id) ?? "";
      zip.file(path, content);
      count++;
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `luvis-${roomCode}-workspace.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.dismiss(toastId);
    toast.success(`Downloaded ${count} file${count !== 1 ? "s" : ""} as ZIP`);
  } catch (e: any) {
    toast.dismiss(toastId);
    toast.error(`Download failed: ${e.message || e}`);
  }
}

// ─── Recursive folder upload to Supabase room_files ──────────────────────────
async function uploadDirToRoom(
  dirHandle: FileSystemDirectoryHandle,
  roomDbId: string,
  userId: string,
  parentId: string | null,
  onProgress: (msg: string) => void,
): Promise<void> {
  // @ts-ignore – values() is widely supported but missing from some TS lib definitions
  for await (const entry of (dirHandle as any).values()) {
    if (entry.kind === "directory") {
      onProgress(`Creating folder: ${entry.name}`);
      const { data, error } = await supabase
        .from("room_files")
        .insert({ room_id: roomDbId, parent_id: parentId, name: entry.name, kind: "folder", content: "", updated_by: userId })
        .select("id")
        .single();
      if (error) { console.error("Folder insert error:", error); continue; }
      await uploadDirToRoom(entry as FileSystemDirectoryHandle, roomDbId, userId, data.id, onProgress);
    } else {
      if (isBinary(entry.name)) { onProgress(`Skipping binary: ${entry.name}`); continue; }
      onProgress(`Uploading: ${entry.name}`);
      try {
        const file = await (entry as FileSystemFileHandle).getFile();
        if (file.size > MAX_FILE_SIZE) { onProgress(`Skipping large file (>500KB): ${entry.name}`); continue; }
        const content = await file.text();
        const language = langFromName(entry.name);
        await supabase
          .from("room_files")
          .insert({ room_id: roomDbId, parent_id: parentId, name: entry.name, kind: "file", content, language, updated_by: userId });
      } catch (e) {
        console.error(`Failed to upload ${entry.name}:`, e);
      }
    }
  }
}

// ─── IDEPanel ─────────────────────────────────────────────────────────────────
export function IDEPanel({ roomDbId, roomCode }: Props) {
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const [files, setFiles] = useState<RoomFile[]>([]);
  const [openTabs, setOpenTabs] = useState<RoomTab[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [problems, setProblems] = useState<editor.IMarker[]>([]);
  const [remotePresence, setRemotePresence] = useState<Record<string, RemotePresence>>({});
  const [uploading, setUploading] = useState(false);

  // Terminal
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalLines, setTerminalLines] = useState<{ kind: "in" | "out" | "err"; text: string }[]>([
    { kind: "out", text: "LUVIS Sandbox Terminal — JavaScript only. Type `help` for commands." },
  ]);
  const [terminalInput, setTerminalInput] = useState("");
  const terminalScrollRef = useRef<HTMLDivElement>(null);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const tabSyncChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const openTabsRef = useRef<RoomTab[]>([]);
  openTabsRef.current = openTabs;
  const cursorWidgetsRef = useRef<Map<number, editor.IContentWidget>>(new Map());

  // ── Load & subscribe to room_files ──────────────────────────────────────────
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
      .on("postgres_changes",
        { event: "*", schema: "public", table: "room_files", filter: `room_id=eq.${roomDbId}` },
        () => load())
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [roomDbId]);

  // ── Presence: who is in the room & what file they have open ─────────────────
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
        if (metas[0]) next[uid] = metas[0];
      });
      setRemotePresence(next);
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ userId: user.id, name: user.email?.split("@")[0] || "User", color: colorFor(user.id), fileName: "" });
      }
    });
    return () => { supabase.removeChannel(ch); presenceChannelRef.current = null; };
  }, [roomDbId, user]);

  useEffect(() => {
    const ch = presenceChannelRef.current;
    if (!ch || !user) return;
    const active = openTabs.find((t) => t.fileId === activeFileId);
    ch.track({ userId: user.id, name: user.email?.split("@")[0] || "User", color: colorFor(user.id), fileName: active?.name || "" });
  }, [activeFileId, openTabs, user]);

  // ── Tab sync: when any user opens a file, all others open it too ─────────────
  useEffect(() => {
    if (!roomDbId || !user) return;
    const ch = supabase.channel(`ide-tabs-${roomDbId}`, {
      config: { broadcast: { self: false } },
    });
    tabSyncChannelRef.current = ch;
    ch
      .on("broadcast", { event: "tab-open" }, async ({ payload }) => {
        const { fileId, name, language } = payload as { fileId: string; name: string; language: string };
        if (openTabsRef.current.find((t) => t.fileId === fileId)) return;
        // Defer so we don't mutate state inside broadcast handler
        setTimeout(() => openFileById(fileId, name, language), 0);
      })
      .on("broadcast", { event: "tab-sync-request" }, () => {
        openTabsRef.current.forEach((t) =>
          ch.send({ type: "broadcast", event: "tab-open", payload: { fileId: t.fileId, name: t.name, language: t.language } })
        );
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          ch.send({ type: "broadcast", event: "tab-sync-request", payload: {} });
        }
      });
    return () => { supabase.removeChannel(ch); tabSyncChannelRef.current = null; };
  }, [roomDbId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced auto-save ───────────────────────────────────────────────────────
  const queueSave = useMemo(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    return (fileId: string, getText: () => string) => {
      clearTimeout(timers.get(fileId));
      timers.set(fileId, setTimeout(async () => {
        await supabase
          .from("room_files")
          .update({ content: getText(), updated_by: user?.id })
          .eq("id", fileId);
        setOpenTabs((tabs) => tabs.map((t) => t.fileId === fileId ? { ...t, dirty: false } : t));
      }, 1200));
    };
  }, [user?.id]);

  // ── Core: open a room file tab ────────────────────────────────────────────────
  const openFileById = useCallback(async (fileId: string, name: string, language: string) => {
    if (!roomDbId) return;
    if (openTabsRef.current.find((t) => t.fileId === fileId)) {
      setActiveFileId(fileId); return;
    }
    const doc = new Y.Doc();
    const text = doc.getText("content");
    const provider = new SupabaseYProvider(roomDbId, fileId, doc);
    const tab: RoomTab = { fileId, name, language, doc, provider, text, dirty: false, loaded: false };
    setOpenTabs((tabs) => [...tabs, tab]);
    setActiveFileId(fileId);

    setTimeout(async () => {
      if (text.length > 0) {
        setOpenTabs((tabs) => tabs.map((t) => t.fileId === fileId ? { ...t, loaded: true } : t));
        return;
      }
      const { data } = await supabase.from("room_files").select("content").eq("id", fileId).maybeSingle();
      if (data?.content && text.length === 0) doc.transact(() => text.insert(0, data.content as string));
      setOpenTabs((tabs) => tabs.map((t) => t.fileId === fileId ? { ...t, loaded: true } : t));
    }, 500);

    text.observe(() => {
      setOpenTabs((tabs) => tabs.map((t) => t.fileId === fileId ? { ...t, dirty: true } : t));
      queueSave(fileId, () => text.toString());
    });
  }, [roomDbId, queueSave]);

  // ── Open a file (also broadcast to peers) ────────────────────────────────────
  const openFile = useCallback(async (file: RoomFile) => {
    const lang = file.language || langFromName(file.name);
    await openFileById(file.id, file.name, lang);
    tabSyncChannelRef.current?.send({
      type: "broadcast", event: "tab-open",
      payload: { fileId: file.id, name: file.name, language: lang },
    });
  }, [openFileById]);

  // ── Close tab ─────────────────────────────────────────────────────────────────
  const closeTab = useCallback((fileId: string) => {
    setOpenTabs((tabs) => {
      const tab = tabs.find((t) => t.fileId === fileId);
      if (tab) tab.provider.destroy();
      const next = tabs.filter((t) => t.fileId !== fileId);
      if (activeFileId === fileId) setActiveFileId(next.length ? next[next.length - 1].fileId : null);
      return next;
    });
  }, [activeFileId]);

  useEffect(() => () => {
    openTabsRef.current.forEach((t) => t.provider.destroy());
  }, []);

  // ── File CRUD ─────────────────────────────────────────────────────────────────
  const createNode = useCallback(async (parentId: string | null, kind: "file" | "folder", name: string): Promise<void> => {
    if (!roomDbId) { toast.error("Room not ready yet. Please wait a moment."); return; }
    if (!user) { toast.error("Not authenticated."); return; }
    const language = kind === "file" ? langFromName(name) : null;
    const { error } = await supabase.from("room_files").insert({
      room_id: roomDbId, parent_id: parentId, name, kind, language, content: "", updated_by: user.id,
    });
    if (error) {
      toast.error(`Failed to create ${kind}: ${error.message}`);
    } else {
      toast.success(`${kind === "file" ? "File" : "Folder"} "${name}" created`);
    }
  }, [roomDbId, user]);

  const renameNode = useCallback(async (id: string, newName: string) => {
    const { error } = await supabase.from("room_files").update({ name: newName, language: langFromName(newName) }).eq("id", id);
    if (error) { toast.error(`Rename failed: ${error.message}`); return; }
    setOpenTabs((tabs) => tabs.map((t) => t.fileId === id ? { ...t, name: newName, language: langFromName(newName) } : t));
  }, []);

  const deleteNode = useCallback(async (id: string) => {
    closeTab(id);
    const { error } = await supabase.from("room_files").delete().eq("id", id);
    if (error) toast.error(`Delete failed: ${error.message}`);
  }, [closeTab]);

  const moveNode = useCallback(async (id: string, newParentId: string | null) => {
    await supabase.from("room_files").update({ parent_id: newParentId }).eq("id", id);
  }, []);

  // ── Open Local Folder → upload to room ───────────────────────────────────────
  const handleOpenLocalFolder = useCallback(async () => {
    if (!roomDbId || !user) { toast.error("Not authenticated."); return; }

    // @ts-expect-error – showDirectoryPicker may not be in all TS lib versions
    if (!window.showDirectoryPicker) {
      toast.error("Your browser doesn't support folder picking. Please use Chrome or Edge.");
      return;
    }

    let dirHandle: FileSystemDirectoryHandle;
    try {
      // @ts-expect-error
      dirHandle = await window.showDirectoryPicker({ mode: "read" });
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error(`Could not open folder: ${e.message || e}`);
      return;
    }

    const confirmed = confirm(
      `"${dirHandle.name}" will be uploaded to the shared workspace.\n\n` +
      "Binary files and files larger than 500KB will be skipped.\n\n" +
      "All participants will see the uploaded files immediately.\n\n" +
      "Continue?"
    );
    if (!confirmed) return;

    setUploading(true);
    const uploadToast = toast.loading(`Uploading "${dirHandle.name}" to workspace…`);
    try {
      await uploadDirToRoom(dirHandle, roomDbId, user.id, null, (msg) => {
        toast.loading(msg, { id: uploadToast });
      });
      toast.success(`"${dirHandle.name}" uploaded — all participants can see it now!`, { id: uploadToast });
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message || e}`, { id: uploadToast });
    } finally {
      setUploading(false);
    }
  }, [roomDbId, roomCode, user]);

  // ── Cursor name widgets (Monaco awareness) ────────────────────────────────────
  const clearCursorWidgets = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    cursorWidgetsRef.current.forEach((w) => ed.removeContentWidget(w));
    cursorWidgetsRef.current.clear();
  }, []);

  const renderCursorWidgets = useCallback((awareness: import("y-protocols/awareness").Awareness) => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;
    clearCursorWidgets();
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === awareness.clientID) return;
      const userInfo = state.user as { name?: string; color?: string } | undefined;
      const cursor = state.selection as { anchor?: { index: number } } | undefined;
      if (!userInfo?.name || cursor?.anchor?.index === undefined) return;
      const model = ed.getModel();
      if (!model) return;
      const pos = model.getPositionAt(cursor.anchor.index);
      const color = userInfo.color || "#6C5CE7";
      const widget: editor.IContentWidget = {
        getId: () => `cursor-label-${clientId}`,
        getDomNode: () => {
          const node = document.createElement("div");
          node.style.cssText = `background:${color};color:#fff;font-size:10px;font-family:'JetBrains Mono',monospace;padding:1px 6px;border-radius:3px 3px 3px 0;white-space:nowrap;pointer-events:none;transform:translateY(-100%);z-index:9999;font-weight:600;`;
          node.textContent = userInfo.name!;
          return node;
        },
        getPosition: () => ({
          position: { lineNumber: pos.lineNumber, column: pos.column },
          preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE],
        }),
      };
      ed.addContentWidget(widget);
      cursorWidgetsRef.current.set(clientId, widget);
    });
  }, [clearCursorWidgets]);

  // ── Monaco binding ────────────────────────────────────────────────────────────
  const activeTab = openTabs.find((t) => t.fileId === activeFileId) || null;

  useEffect(() => {
    if (!activeTab || !editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    monacoRef.current.editor.setModelLanguage(model, activeTab.language);
    bindingRef.current?.destroy();
    bindingRef.current = null;
    clearCursorWidgets();

    bindingRef.current = new MonacoBinding(
      activeTab.text, model, new Set([editorRef.current]), activeTab.provider.awareness,
    );
    activeTab.provider.awareness.setLocalStateField("user", {
      name: user?.email?.split("@")[0] || "User",
      color: user ? colorFor(user.id) : "#6C5CE7",
    });
    const awarenessHandler = () => renderCursorWidgets(activeTab.provider.awareness);
    activeTab.provider.awareness.on("change", awarenessHandler);

    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
      clearCursorWidgets();
      activeTab.provider.awareness.off("change", awarenessHandler);
    };
  }, [activeTab?.fileId, user, clearCursorWidgets, renderCursorWidgets]); // eslint-disable-line react-hooks/exhaustive-deps

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
  };

  // ── Terminal (sandboxed JS) ───────────────────────────────────────────────────
  const appendOut = (kind: "in" | "out" | "err", text: string) =>
    setTerminalLines((ls) => [...ls, { kind, text }]);

  const runInSandbox = (code: string): Promise<void> =>
    new Promise((resolve) => {
      const workerCode = `
        const send=(kind,args)=>self.postMessage({kind,text:args.map(a=>{try{return typeof a==="string"?a:JSON.stringify(a);}catch{return String(a);}}).join(" ")});
        const console={log:(...a)=>send("out",a),info:(...a)=>send("out",a),warn:(...a)=>send("err",a),error:(...a)=>send("err",a)};
        try{self.fetch=undefined;}catch(e){}
        try{self.XMLHttpRequest=undefined;}catch(e){}
        self.onmessage=(e)=>{
          try{
            const r=(new Function("console","return (async()=>{"+e.data+"})()"))(console);
            Promise.resolve(r).then(v=>{if(v!==undefined)send("out",[v]);self.postMessage({kind:"done"});},err=>{send("err",[String(err)]);self.postMessage({kind:"done"});});
          }catch(err){send("err",[String(err)]);self.postMessage({kind:"done"});}
        };
      `;
      const blob = new Blob([workerCode], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      const timeout = setTimeout(() => { appendOut("err", "[timeout] exceeded 5s"); worker.terminate(); URL.revokeObjectURL(url); resolve(); }, 5000);
      worker.onmessage = (e) => {
        if (e.data.kind === "done") { clearTimeout(timeout); worker.terminate(); URL.revokeObjectURL(url); resolve(); }
        else appendOut(e.data.kind, e.data.text);
      };
      worker.onerror = (e) => { appendOut("err", e.message); clearTimeout(timeout); worker.terminate(); URL.revokeObjectURL(url); resolve(); };
      worker.postMessage(code);
    });

  const handleTerminalSubmit = async () => {
    const cmd = terminalInput.trim();
    if (!cmd) return;
    appendOut("in", `$ ${cmd}`);
    setTerminalInput("");
    if (cmd === "help") { appendOut("out", "Commands: help, clear, run, or any JS expression."); return; }
    if (cmd === "clear") { setTerminalLines([]); return; }
    if (cmd === "run") {
      if (!activeTab) { appendOut("err", "No file open."); return; }
      if (activeTab.language !== "javascript" && activeTab.language !== "typescript") {
        appendOut("err", `Cannot run ${activeTab.language} in sandbox.`); return;
      }
      await runInSandbox(activeTab.text.toString()); return;
    }
    await runInSandbox(cmd);
  };

  const runActiveFile = async () => {
    if (!activeTab) return;
    if (!terminalOpen) setTerminalOpen(true);
    if (activeTab.language !== "javascript" && activeTab.language !== "typescript") {
      appendOut("err", `Cannot run ${activeTab.language} in sandbox.`); return;
    }
    appendOut("in", `$ run ${activeTab.name}`);
    await runInSandbox(activeTab.text.toString());
  };

  useEffect(() => {
    terminalScrollRef.current?.scrollTo({ top: terminalScrollRef.current.scrollHeight });
  }, [terminalLines, terminalOpen]);

  const presenceList = Object.values(remotePresence);

  // If room is still loading from the parent, show a loader instead of rendering
  // the empty state prematurely (which causes the fallback query error on clicks).
  if (!roomDbId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
        <span className="text-sm">Connecting to workspace...</span>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-2 py-1.5 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? "Hide explorer" : "Show explorer"}>
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </Button>
        <span className="text-xs font-mono text-muted-foreground">
          Room <span className="text-foreground font-semibold">{roomCode}</span>
        </span>

        {/* Collaborator avatars */}
        {presenceList.length > 0 && (
          <div className="hidden md:flex items-center gap-1 ml-1">
            {presenceList.slice(0, 6).map((p) => (
              <div key={p.userId}
                title={`${p.name}${p.fileName ? ` → ${p.fileName}` : ""}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-sm ring-1 ring-background"
                style={{ background: p.color }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
            ))}
            {presenceList.length > 6 && <span className="text-[10px] text-muted-foreground">+{presenceList.length - 6}</span>}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[11px] text-emerald-500 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
          </span>
          <Button size="sm" variant="ghost" onClick={runActiveFile} disabled={!activeTab}
            title="Run active JS file" className="h-7 px-2 text-xs">
            <Play className="mr-1 h-3.5 w-3.5" /> Run
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setTerminalOpen((v) => !v)}
            className="h-7 px-2 text-xs">
            <TerminalIcon className="mr-1 h-3.5 w-3.5" /> Terminal
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={() => roomDbId && downloadWorkspaceZip(roomDbId, files, roomCode)}
            disabled={!roomDbId || files.filter((f) => f.kind === "file").length === 0}
            title="Download entire workspace as ZIP"
            className="h-7 px-2 text-xs"
          >
            <Download className="mr-1 h-3.5 w-3.5" /> Download
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
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
              onOpenLocalFolder={handleOpenLocalFolder}
              uploading={uploading}
              collaboratorCount={presenceList.length}
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Tabs */}
          <div className="flex items-center overflow-x-auto border-b border-border bg-card/40 shrink-0">
            {openTabs.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground italic">
                {uploading ? (
                  <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Uploading folder…</span>
                ) : "Open a file from the Workspace to start coding…"}
              </div>
            )}
            {openTabs.map((tab) => (
              <div key={tab.fileId}
                onClick={() => setActiveFileId(tab.fileId)}
                className={cn(
                  "group flex shrink-0 items-center gap-1.5 border-r border-border px-3 py-1.5 text-xs cursor-pointer transition-colors",
                  activeFileId === tab.fileId
                    ? "bg-background text-foreground border-t-2 border-t-primary"
                    : "text-muted-foreground hover:bg-muted/40",
                )}>
                <span className="truncate max-w-[130px]">{tab.name}</span>
                {tab.dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />}
                <button
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.fileId); }}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Editor area */}
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
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
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
                  renderWhitespace: "boundary",
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
                <FolderArchive className="h-12 w-12 opacity-20" />
                <div className="text-center">
                  <p className="text-sm font-medium">No file open</p>
                  <p className="text-xs mt-1 opacity-60">
                    {files.length === 0
                      ? "Open a local folder or create a file to get started"
                      : "Click a file in the Workspace explorer"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Terminal */}
          {terminalOpen && (
            <div className="flex h-48 flex-col border-t border-border bg-black/95 text-green-300 shrink-0">
              <div className="flex items-center gap-2 border-b border-border bg-card/40 px-3 py-1 text-xs text-muted-foreground">
                <TerminalIcon className="h-3.5 w-3.5" />
                <span>Terminal (sandboxed JS)</span>
                <span className="ml-auto flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setTerminalLines([])}><Trash2 className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setTerminalOpen(false)}><X className="h-3 w-3" /></Button>
                </span>
              </div>
              <div ref={terminalScrollRef} className="flex-1 overflow-auto px-3 py-2 font-mono text-xs">
                {terminalLines.map((l, i) => (
                  <div key={i} className={cn("whitespace-pre-wrap", l.kind === "in" && "text-primary", l.kind === "err" && "text-destructive")}>{l.text}</div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-border bg-black/80 px-3 py-1.5 font-mono text-xs">
                <span className="text-primary">$</span>
                <input value={terminalInput} onChange={(e) => setTerminalInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleTerminalSubmit(); }}
                  placeholder="run | clear | help | <js expression>"
                  className="flex-1 bg-transparent text-green-200 outline-none placeholder:text-muted-foreground/50" />
              </div>
            </div>
          )}

          {/* Problems panel */}
          <div className="border-t border-border bg-card/40 shrink-0">
            <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40"
              onClick={() => setProblemsOpen((v) => !v)}>
              <AlertCircle className="h-3.5 w-3.5" />
              Problems
              <span className={cn("rounded px-1.5 py-0.5 text-[10px]", problems.length > 0 ? "bg-destructive/20 text-destructive" : "bg-muted")}>
                {problems.length}
              </span>
              <span className="ml-auto">
                {problemsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </span>
            </button>
            {problemsOpen && (
              <div className="max-h-32 overflow-auto px-3 pb-2 text-xs">
                {problems.length === 0 && <div className="py-2 text-muted-foreground">No problems detected.</div>}
                {problems.map((p, i) => (
                  <div key={i} className="cursor-pointer py-0.5 hover:text-foreground"
                    onClick={() => { editorRef.current?.revealLineInCenter(p.startLineNumber); editorRef.current?.setPosition({ lineNumber: p.startLineNumber, column: p.startColumn }); editorRef.current?.focus(); }}>
                    <span className={cn("mr-2 font-mono", p.severity === 8 ? "text-destructive" : p.severity === 4 ? "text-yellow-500" : "text-muted-foreground")}>
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
