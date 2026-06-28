import { Video, Code2, PenTool, MessageSquare, Users, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

type TabValue = "video" | "code" | "whiteboard" | "chat" | "participants" | "files";

interface MobileBottomNavProps {
  activeTab: TabValue;
  onTabChange: (tab: TabValue) => void;
  className?: string;
}

export function MobileBottomNav({ activeTab, onTabChange, className }: MobileBottomNavProps) {
  const tabs = [
    { id: "video", label: "Video", icon: Video },
    { id: "code", label: "Code", icon: Code2 },
    { id: "whiteboard", label: "Board", icon: PenTool },
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "participants", label: "People", icon: Users },
  ] as const;

  return (
    <div className={cn("flex items-center justify-between bg-card border-t border-border safe-pb px-2", className)}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id as TabValue)}
            className={cn(
              "flex flex-col items-center justify-center w-full py-2 min-h-[56px] transition-colors gap-1",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
