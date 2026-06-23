import { useMemo, useState, useRef, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  File as FileIcon,
  Folder,
  FolderOpen,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  MoreHorizontal,
  HardDrive,
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

// Local (File System Access API) tree node
export type LocalNode = {
  id: string; // unique path
  name: string;
  kind: "file" | "folder";
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  children?: LocalNode[];
};

interface Props {
  files: RoomFile[];
  activeFileId: string | null;
  onOpen: (file: RoomFile) => void;
  onCreate: (parentId: string | null, kind: "file" | "folder", name: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, newParentId: string | null) => void;
  // Local folder
  localRoot: LocalNode | null;
  onOpenLocalFolder: () => void;
  onOpenLocalFile: (node: LocalNode) => void;
  onCreateLocal: (parent: LocalNode | null, kind: "file" | "folder", name: string) => void;
  onCloseLocalFolder: () => void;
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

// Inline name input
function InlineInput({
  defaultValue = "",
  onConfirm,
  onCancel,
  depth,
  icon,
}: {
  defaultValue?: string;
  onConfirm: (v: string) => void;
  onCancel: () => void;
  depth: number;
  icon: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5"
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      <span className="w-3" />
      {icon}
      <input
        ref={ref}
        defaultValue={defaultValue}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = (e.target as HTMLInputElement).value.trim();
            if (v) onConfirm(v);
            else onCancel();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v) onConfirm(v);
          else onCancel();
        }}
        className="flex-1 rounded border border-primary/40 bg-background px-1 text-xs outline-none focus:border-primary"
      />
    </div>
  );
}

export function FileExplorer(props: Props) {
  const tree = useMemo(() => buildTree(props.files), [props.files]);
  // Inline create state: { parentId, kind } | null  (parentId = null for root)
  const [rootCreate, setRootCreate] = useState<"file" | "folder" | null>(null);
  const [localRootCreate, setLocalRootCreate] = useState<"file" | "folder" | null>(null);

  return (
    <div className="flex h-full flex-col bg-card/40 text-sm">
      {/* Room (collaborative) files */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Room Files
        </span>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" title="New file"
            onClick={() => setRootCreate("file")}>
            <FilePlus className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" title="New folder"
            onClick={() => setRootCreate("folder")}>
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div
        className="max-h-[45%] overflow-auto py-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("text/file-id");
          if (id) props.onMove(id, null);
        }}
      >
        {rootCreate && (
          <InlineInput
            depth={0}
            icon={rootCreate === "folder"
              ? <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
              : <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            onConfirm={(name) => { props.onCreate(null, rootCreate, name); setRootCreate(null); }}
            onCancel={() => setRootCreate(null)}
          />
        )}
        {tree.length === 0 && !rootCreate && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No files yet.
          </div>
        )}
        {tree.map((node) => (
          <TreeRow key={node.id} node={node} depth={0} {...props} />
        ))}
      </div>

      {/* Local folder */}
      <div className="flex items-center justify-between border-y border-border bg-muted/20 px-3 py-2">
        <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <HardDrive className="h-3 w-3" /> Local Folder
        </span>
        <div className="flex items-center gap-1">
          {props.localRoot && (
            <>
              <Button size="icon" variant="ghost" className="h-6 w-6" title="New file"
                onClick={() => setLocalRootCreate("file")}>
                <FilePlus className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" title="New folder"
                onClick={() => setLocalRootCreate("folder")}>
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" title="Close folder"
                onClick={props.onCloseLocalFolder}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {!props.localRoot ? (
          <div className="px-3 py-3">
            <Button size="sm" variant="outline" className="w-full" onClick={props.onOpenLocalFolder}>
              <HardDrive className="mr-1.5 h-3.5 w-3.5" /> Open Folder
            </Button>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Pick a folder on your computer to edit local files directly.
            </p>
          </div>
        ) : (
          <>
            <div className="px-3 py-1 text-[11px] font-medium text-foreground/80">
              {props.localRoot.name}
            </div>
            {localRootCreate && (
              <InlineInput
                depth={1}
                icon={localRootCreate === "folder"
                  ? <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
                  : <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                onConfirm={(name) => { props.onCreateLocal(props.localRoot, localRootCreate, name); setLocalRootCreate(null); }}
                onCancel={() => setLocalRootCreate(null)}
              />
            )}
            {props.localRoot.children?.map((n) => (
              <LocalRow
                key={n.id}
                node={n}
                depth={1}
                onOpen={props.onOpenLocalFile}
                onCreate={props.onCreateLocal}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  activeFileId,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onMove,
}: { node: TreeNode; depth: number } & Props) {
  const [open, setOpen] = useState(true);
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const [renaming, setRenaming] = useState(false);
  const isFolder = node.kind === "folder";
  const isActive = !isFolder && activeFileId === node.id;

  return (
    <div>
      {renaming ? (
        <InlineInput
          depth={depth}
          defaultValue={node.name}
          icon={isFolder
            ? <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
            : <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          onConfirm={(name) => { if (name !== node.name) onRename(node.id, name); setRenaming(false); }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <div
          className={cn(
            "group flex items-center gap-1 px-2 py-0.5 hover:bg-muted/40 cursor-pointer select-none",
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
          {isFolder ? (
            open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
          ) : (
            <span className="w-3" />
          )}
          {isFolder ? (
            open ? <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" /> : <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
          ) : (
            <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="flex-1 truncate text-xs">{node.name}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-muted"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {isFolder && (
                <>
                  <DropdownMenuItem onClick={() => { setOpen(true); setCreating("file"); }}>
                    <FilePlus className="mr-2 h-3.5 w-3.5" /> New file
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setOpen(true); setCreating("folder"); }}>
                    <FolderPlus className="mr-2 h-3.5 w-3.5" /> New folder
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => setRenaming(true)}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => { if (confirm(`Delete ${node.name}?`)) onDelete(node.id); }}
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
              icon={creating === "folder"
                ? <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
                : <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              onConfirm={(name) => { onCreate(node.id, creating, name); setCreating(null); }}
              onCancel={() => setCreating(null)}
            />
          )}
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              files={[]}
              activeFileId={activeFileId}
              onOpen={onOpen}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              onMove={onMove}
              localRoot={null}
              onOpenLocalFolder={() => {}}
              onOpenLocalFile={() => {}}
              onCreateLocal={() => {}}
              onCloseLocalFolder={() => {}}
            />
          ))}
        </>
      )}
    </div>
  );
}

function LocalRow({
  node,
  depth,
  onOpen,
  onCreate,
}: {
  node: LocalNode;
  depth: number;
  onOpen: (n: LocalNode) => void;
  onCreate: (parent: LocalNode | null, kind: "file" | "folder", name: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const isFolder = node.kind === "folder";

  return (
    <div>
      <div
        className="group flex items-center gap-1 px-2 py-0.5 hover:bg-muted/40 cursor-pointer select-none"
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => (isFolder ? setOpen(!open) : onOpen(node))}
      >
        {isFolder ? (
          open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
        ) : (
          <span className="w-3" />
        )}
        {isFolder ? (
          open ? <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" /> : <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
        ) : (
          <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="flex-1 truncate text-xs">{node.name}</span>
        {isFolder && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-muted"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => { setOpen(true); setCreating("file"); }}>
                <FilePlus className="mr-2 h-3.5 w-3.5" /> New file
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setOpen(true); setCreating("folder"); }}>
                <FolderPlus className="mr-2 h-3.5 w-3.5" /> New folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {isFolder && open && (
        <>
          {creating && (
            <InlineInput
              depth={depth + 1}
              icon={creating === "folder"
                ? <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
                : <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              onConfirm={(name) => { onCreate(node, creating, name); setCreating(null); }}
              onCancel={() => setCreating(null)}
            />
          )}
          {node.children?.map((child) => (
            <LocalRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onOpen={onOpen}
              onCreate={onCreate}
            />
          ))}
        </>
      )}
    </div>
  );
}
