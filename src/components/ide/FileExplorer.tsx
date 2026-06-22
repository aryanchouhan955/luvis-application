import { useMemo, useState } from "react";
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

interface Props {
  files: RoomFile[];
  activeFileId: string | null;
  onOpen: (file: RoomFile) => void;
  onCreate: (parentId: string | null, kind: "file" | "folder", name: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, newParentId: string | null) => void;
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

export function FileExplorer(props: Props) {
  const tree = useMemo(() => buildTree(props.files), [props.files]);

  return (
    <div className="flex h-full flex-col bg-card/40 text-sm">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title="New file"
            onClick={() => {
              const name = prompt("File name (e.g. main.js)");
              if (name) props.onCreate(null, "file", name);
            }}
          >
            <FilePlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title="New folder"
            onClick={() => {
              const name = prompt("Folder name");
              if (name) props.onCreate(null, "folder", name);
            }}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div
        className="flex-1 overflow-auto py-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("text/file-id");
          if (id) props.onMove(id, null);
        }}
      >
        {tree.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No files yet. Create one to start.
          </div>
        )}
        {tree.map((node) => (
          <TreeRow key={node.id} node={node} depth={0} {...props} />
        ))}
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
  const isFolder = node.kind === "folder";
  const isActive = !isFolder && activeFileId === node.id;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 px-2 py-0.5 hover:bg-muted/40 cursor-pointer select-none",
          isActive && "bg-primary/15 text-primary",
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/file-id", node.id)}
        onDragOver={(e) => {
          if (isFolder) e.preventDefault();
        }}
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
                <DropdownMenuItem
                  onClick={() => {
                    const name = prompt("File name");
                    if (name) onCreate(node.id, "file", name);
                  }}
                >
                  <FilePlus className="mr-2 h-3.5 w-3.5" /> New file
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const name = prompt("Folder name");
                    if (name) onCreate(node.id, "folder", name);
                  }}
                >
                  <FolderPlus className="mr-2 h-3.5 w-3.5" /> New folder
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              onClick={() => {
                const name = prompt("Rename to", node.name);
                if (name && name !== node.name) onRename(node.id, name);
              }}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                if (confirm(`Delete ${node.name}?`)) onDelete(node.id);
              }}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isFolder && open && node.children.map((child) => (
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
        />
      ))}
    </div>
  );
}
