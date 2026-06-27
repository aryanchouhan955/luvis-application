import { useMemo, useState, useRef, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  File as FileIcon,
  Folder,
  FolderOpen,
  FilePlus,
  FolderPlus,
  FolderOpen as FolderOpenIcon,
  Pencil,
  Trash2,
  MoreHorizontal,
  HardDrive,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type RoomFile = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: "file" | "folder";
  language: string | null;
  position: number;
};

// LocalNode kept for upstream type compat
export type LocalNode = {
  id: string;
  name: string;
  kind: "file" | "folder";
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  children?: LocalNode[];
};

interface Props {
  files: RoomFile[];
  activeFileId: string | null;
  onOpen: (file: RoomFile) => void;
  onCreate: (parentId: string | null, kind: "file" | "folder", name: string) => Promise<void>;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, newParentId: string | null) => void;
  onOpenLocalFolder: () => void;
  uploading?: boolean;
  collaboratorCount?: number;
}

interface TreeNode extends RoomFile {
  children: TreeNode[];
}

function buildTree(files: RoomFile[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  files.forEach((f) => map.set(f.id, { ...f, children: [] }));
  const roots: TreeNode[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

// ─── InlineInput: fixed double-confirm bug ───────────────────────────────────
// The bug: onKeyDown(Enter) calls onConfirm → state changes unmount the input →
// onBlur fires and calls onConfirm AGAIN. Fix: track submitted with a ref.
function InlineInput({
  defaultValue = "",
  onConfirm,
  onCancel,
  depth,
  icon,
  siblingNames = [],
}: {
  defaultValue?: string;
  onConfirm: (v: string) => void;
  onCancel: () => void;
  depth: number;
  icon: React.ReactNode;
  siblingNames?: string[];
}) {
  const ref = useRef<HTMLInputElement>(null);
  const submitted = useRef(false); // ← prevents double-fire
  const [error, setError] = useState("");

  useEffect(() => {
    ref.current?.focus();
    if (defaultValue) ref.current?.select();
  }, [defaultValue]);

  const tryConfirm = (value: string) => {
    if (submitted.current) return;
    const v = value.trim();
    if (!v) { onCancel(); return; }
    // Validate: no slashes, no duplication
    if (v.includes("/") || v.includes("\\")) {
      setError("Name cannot contain slashes"); return;
    }
    if (siblingNames.includes(v) && v !== defaultValue) {
      setError("A file or folder with that name already exists"); return;
    }
    submitted.current = true;
    onConfirm(v);
  };

  return (
    <div style={{ paddingLeft: 8 + depth * 12 }}>
      <div className="flex items-center gap-1 px-2 py-0.5">
        <span className="w-3" />
        {icon}
        <input
          ref={ref}
          defaultValue={defaultValue}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); tryConfirm((e.target as HTMLInputElement).value); }
            else if (e.key === "Escape") { submitted.current = true; onCancel(); }
          }}
          onBlur={(e) => tryConfirm(e.target.value)}
          className="flex-1 rounded border border-primary/40 bg-background px-1 text-xs outline-none focus:border-primary"
        />
      </div>
      {error && (
        <div className="px-3 pb-1 text-[10px] text-destructive" style={{ paddingLeft: 8 + depth * 12 + 20 }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Main FileExplorer ────────────────────────────────────────────────────────
export function FileExplorer({
  files,
  activeFileId,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onMove,
  onOpenLocalFolder,
  uploading = false,
  collaboratorCount = 0,
}: Props) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [rootCreate, setRootCreate] = useState<"file" | "folder" | null>(null);

  // Get names of root-level nodes for dupe detection
  const rootNames = tree.map((n) => n.name);

  return (
    <div className="flex h-full flex-col bg-card/40 text-sm select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Workspace
          </span>
          {collaboratorCount > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {collaboratorCount + 1}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon" variant="ghost" className="h-6 w-6" title="Open local folder and sync to room"
            onClick={onOpenLocalFolder}
            disabled={uploading}
          >
            {uploading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <HardDrive className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="icon" variant="ghost" className="h-6 w-6" title="New file"
            onClick={() => setRootCreate("file")}
            disabled={uploading}
          >
            <FilePlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon" variant="ghost" className="h-6 w-6" title="New folder"
            onClick={() => setRootCreate("folder")}
            disabled={uploading}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Upload progress indicator */}
      {uploading && (
        <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-3 py-1.5 text-xs text-primary">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          Uploading folder to workspace…
        </div>
      )}

      {/* Tree */}
      <div
        className="flex-1 overflow-auto py-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("text/file-id");
          if (id) onMove(id, null);
        }}
      >
        {rootCreate && (
          <InlineInput
            depth={0}
            siblingNames={rootNames}
            icon={rootCreate === "folder"
              ? <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              : <FileIcon className="h-3.5 w-3.5 text-sky-400 shrink-0" />}
            onConfirm={async (name) => {
              setRootCreate(null);
              await onCreate(null, rootCreate, name);
            }}
            onCancel={() => setRootCreate(null)}
          />
        )}

        {tree.length === 0 && !rootCreate && !uploading && (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <div className="rounded-lg border border-dashed border-border p-4">
              <FolderOpenIcon className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground/70">Workspace is empty</p>
              <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                Open a local folder to sync it here,<br />or create files manually with +
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={onOpenLocalFolder}
            >
              <HardDrive className="h-3.5 w-3.5" />
              Open Folder
            </Button>
          </div>
        )}

        {tree.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            depth={0}
            activeFileId={activeFileId}
            onOpen={onOpen}
            onCreate={onCreate}
            onRename={onRename}
            onDelete={onDelete}
            onMove={onMove}
          />
        ))}
      </div>
    </div>
  );
}

// ─── TreeRow ─────────────────────────────────────────────────────────────────
function TreeRow({
  node,
  depth,
  activeFileId,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onMove,
}: {
  node: TreeNode;
  depth: number;
  activeFileId: string | null;
  onOpen: (file: RoomFile) => void;
  onCreate: (parentId: string | null, kind: "file" | "folder", name: string) => Promise<void>;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, newParentId: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const [renaming, setRenaming] = useState(false);
  const isFolder = node.kind === "folder";
  const isActive = !isFolder && activeFileId === node.id;
  const childNames = node.children.map((c) => c.name);

  return (
    <div>
      {renaming ? (
        <InlineInput
          depth={depth}
          defaultValue={node.name}
          icon={isFolder
            ? <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            : <FileIcon className="h-3.5 w-3.5 text-sky-400 shrink-0" />}
          onConfirm={(name) => { if (name !== node.name) onRename(node.id, name); setRenaming(false); }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <div
          className={cn(
            "group flex items-center gap-1 py-0.5 pr-1 hover:bg-muted/40 cursor-pointer",
            isActive && "bg-primary/15 text-primary",
          )}
          style={{ paddingLeft: 8 + depth * 12 }}
          draggable
          onDragStart={(e) => e.dataTransfer.setData("text/file-id", node.id)}
          onDragOver={(e) => { if (isFolder) e.preventDefault(); }}
          onDrop={(e) => {
            e.stopPropagation();
            if (!isFolder) return;
            const id = e.dataTransfer.getData("text/file-id");
            if (id && id !== node.id) onMove(id, node.id);
          }}
          onClick={() => (isFolder ? setOpen(!open) : onOpen(node))}
        >
          {isFolder
            ? open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
            : <span className="w-3" />}
          {isFolder
            ? open
              ? <FolderOpen className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              : <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            : <FileIcon className="h-3.5 w-3.5 text-sky-400 shrink-0" />}
          <span className="flex-1 truncate text-xs">{node.name}</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-muted transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {isFolder && (
                <>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setOpen(true); setCreating("file"); }}>
                    <FilePlus className="mr-2 h-3.5 w-3.5" /> New file
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setOpen(true); setCreating("folder"); }}>
                    <FolderPlus className="mr-2 h-3.5 w-3.5" /> New folder
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => setRenaming(true)}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => { if (confirm(`Delete "${node.name}"?`)) onDelete(node.id); }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {isFolder && open && (
        <>
          {creating && (
            <InlineInput
              depth={depth + 1}
              siblingNames={childNames}
              icon={creating === "folder"
                ? <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                : <FileIcon className="h-3.5 w-3.5 text-sky-400 shrink-0" />}
              onConfirm={async (name) => {
                setCreating(null);
                await onCreate(node.id, creating, name);
              }}
              onCancel={() => setCreating(null)}
            />
          )}
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              onOpen={onOpen}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              onMove={onMove}
            />
          ))}
        </>
      )}
    </div>
  );
}
