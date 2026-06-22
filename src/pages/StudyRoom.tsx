import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import {
  Hand,
  Link2,
  MousePointer2,
  Check,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  PhoneOff,
  Users,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { WhiteboardCanvas } from "@/components/whiteboard/WhiteboardCanvas";
import { IDEPanel } from "@/components/ide/IDEPanel";
import { Notepad } from "@/components/room/Notepad";
import { PomodoroTimer } from "@/components/timer/PomodoroTimer";
import { VideoGrid } from "@/components/room/VideoGrid";
import { SharedTopicEditor } from "@/components/room/SharedTopicEditor";
import { ChatPanel } from "@/components/room/ChatPanel";
import { logActivity } from "@/components/room/ActivityLog";

import { CollabCursors } from "@/components/room/CollabCursors";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useStudyTracker } from "@/hooks/useStudyTracker";
import { cn } from "@/lib/utils";

export default function StudyRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState<any>(null);
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});
  const [myHand, setMyHand] = useState(false);
  const [cursorsOn, setCursorsOn] = useState(true);
  const [copied, setCopied] = useState(false);

  const [participantsCollapsed, setParticipantsCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [topicCollapsed, setTopicCollapsed] = useState(false);

  const participantsRef = useRef<ImperativePanelHandle>(null);
  const chatRef = useRef<ImperativePanelHandle>(null);
  const topicRef = useRef<ImperativePanelHandle>(null);

  const handChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useStudyTracker(!!roomId);

  const {
    localStream,
    participants,
    presence,
    micOn,
    camOn,
    speakerOn,
    toggleMic,
    toggleCam,
    toggleSpeaker,
  } = useWebRTC(roomId || "");

  const timerMinutes = room?.timer_duration
    ? Math.max(1, Math.ceil(room.timer_duration / 60))
    : 25;

  useEffect(() => {
    if (!roomId) return;
    supabase
      .from("rooms")
      .select("*")
      .eq("room_id", roomId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setRoom(data);
      });
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !user) return;
    const ch = supabase.channel(`hand-${roomId}`);
    handChannelRef.current = ch;
    ch.on("broadcast", { event: "hand" }, (p) => {
      const { userId, raised, name } = p.payload;
      setRaisedHands((prev) => ({ ...prev, [userId]: raised }));
      if (raised) {
        toast(`✋ ${name || "Someone"} raised their hand`);
        logActivity(roomId, `${name || "Someone"} raised hand`);
      }
    }).subscribe();

    logActivity(roomId, `${user.email?.split("@")[0] || "Someone"} joined`);

    return () => {
      logActivity(roomId, `${user.email?.split("@")[0] || "Someone"} left`);
      supabase.removeChannel(ch);
    };
  }, [roomId, user]);

  const toggleHand = useCallback(() => {
    const next = !myHand;
    setMyHand(next);
    if (user) {
      handChannelRef.current?.send({
        type: "broadcast",
        event: "hand",
        payload: {
          userId: user.id,
          raised: next,
          name: user.email?.split("@")[0] || "User",
        },
      });
    }
  }, [myHand, user]);

  const copyInvite = useCallback(async () => {
    if (!roomId) return;
    const url = `${window.location.origin}/join-room?roomId=${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [roomId]);

  const copyRoomId = useCallback(async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success("Room ID copied");
    } catch {
      toast.error("Failed to copy");
    }
  }, [roomId]);

  const toggleParticipants = () => {
    const p = participantsRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  };
  const toggleChat = () => {
    const p = chatRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  };
  const toggleTopic = () => {
    const p = topicRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  };

  return (
    <div className="relative flex h-[calc(100vh-4rem)] flex-col bg-background">
      {/* Main horizontal area */}
      <div className="relative flex flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Participants */}
          <ResizablePanel
            ref={participantsRef}
            defaultSize={18}
            minSize={12}
            maxSize={35}
            collapsible
            collapsedSize={0}
            onCollapse={() => setParticipantsCollapsed(true)}
            onExpand={() => setParticipantsCollapsed(false)}
            className={cn(
              "transition-all duration-200",
              participantsCollapsed && "min-w-0"
            )}
          >
            <div className="flex h-full flex-col border-r border-border bg-card p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" />
                Participants
              </div>
              <div className="flex-1 overflow-auto">
                <VideoGrid
                  localStream={localStream}
                  participants={participants}
                  presence={presence}
                  speakerOn={speakerOn}
                  raisedHands={raisedHands}
                  localUserId={user?.id}
                  localRaised={myHand}
                />

              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Workspace + topic vertically split */}
          <ResizablePanel defaultSize={60} minSize={30}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel
                ref={topicRef}
                defaultSize={12}
                minSize={8}
                maxSize={30}
                collapsible
                collapsedSize={0}
                onCollapse={() => setTopicCollapsed(true)}
                onExpand={() => setTopicCollapsed(false)}
                className="transition-all duration-200"
              >
                <div className="h-full bg-card px-4 py-3">
                  <SharedTopicEditor
                    roomId={roomId || ""}
                    onChangeNotify={(t) =>
                      logActivity(roomId || "", `Topic updated: "${t.slice(0, 60)}"`)
                    }
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={88}>
                {/* Top restore handle for topic */}
                {topicCollapsed && (
                  <button
                    onClick={toggleTopic}
                    className="flex w-full items-center justify-center gap-1 border-b border-border bg-card/80 py-1 text-xs text-muted-foreground hover:bg-card hover:text-foreground"
                  >
                    <ChevronDown className="h-3 w-3" />
                    Show topic
                  </button>
                )}
                <Tabs defaultValue="whiteboard" className="flex h-full flex-col">
                  <div className="border-b border-border px-4">
                    <TabsList className="bg-transparent">
                      <TabsTrigger value="whiteboard">Whiteboard</TabsTrigger>
                      <TabsTrigger value="notepad">Notepad</TabsTrigger>
                      <TabsTrigger value="code">Code Editor</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="whiteboard" className="m-0 flex-1 overflow-hidden">
                    <CollabCursors
                      roomId={roomId || ""}
                      panel="whiteboard"
                      enabled={cursorsOn}
                    >
                      <WhiteboardCanvas roomId={roomId || ""} />
                    </CollabCursors>
                  </TabsContent>
                  <TabsContent value="notepad" className="m-0 flex-1 overflow-hidden p-4">
                    <CollabCursors
                      roomId={roomId || ""}
                      panel="notepad"
                      enabled={cursorsOn}
                    >
                      <Notepad roomId={roomId} />
                    </CollabCursors>
                  </TabsContent>
                  <TabsContent value="code" className="m-0 flex-1 overflow-hidden">
                    <IDEPanel roomDbId={room?.id ?? null} roomCode={roomId || ""} />
                  </TabsContent>
                </Tabs>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Chat */}
          <ResizablePanel
            ref={chatRef}
            defaultSize={22}
            minSize={14}
            maxSize={40}
            collapsible
            collapsedSize={0}
            onCollapse={() => setChatCollapsed(true)}
            onExpand={() => setChatCollapsed(false)}
            className={cn(
              "transition-all duration-200",
              chatCollapsed && "min-w-0"
            )}
          >
            <ChatPanel roomId={roomId || ""} open onToggle={toggleChat} />
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Restore handles when collapsed */}
        {participantsCollapsed && (
          <button
            onClick={toggleParticipants}
            className="absolute left-0 top-1/2 z-30 flex h-20 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-border bg-card text-muted-foreground shadow-md hover:text-foreground"
            title="Show participants"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {chatCollapsed && (
          <button
            onClick={toggleChat}
            className="absolute right-0 top-1/2 z-30 flex h-20 w-5 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-border bg-card text-muted-foreground shadow-md hover:text-foreground"
            title="Show chat"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Bottom control center */}
      <div className="relative flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3">
        {/* Left: room id + invite + panel toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={copyRoomId}
            className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-primary hover:bg-muted"
            title="Click to copy Room ID"
          >
            {roomId}
          </button>
          <Button variant="outline" size="sm" onClick={copyInvite}>
            {copied ? (
              <Check className="mr-1 h-4 w-4 text-primary" />
            ) : (
              <Link2 className="mr-1 h-4 w-4" />
            )}
            {copied ? "Copied" : "Invite"}
          </Button>
          <Button
            variant={participantsCollapsed ? "outline" : "ghost"}
            size="sm"
            onClick={toggleParticipants}
            title="Toggle participants"
          >
            <Users className="h-4 w-4" />
          </Button>
          <Button
            variant={topicCollapsed ? "outline" : "ghost"}
            size="sm"
            onClick={toggleTopic}
            title="Toggle topic"
          >
            {topicCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Center: primary media controls — absolutely centered so they stay perfectly aligned */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center">
          <div className="pointer-events-auto flex items-center justify-center gap-3">
            <Button
              variant={micOn ? "default" : "outline"}
              size="icon"
              onClick={toggleMic}
              className="h-12 w-12 rounded-full"
              title={micOn ? "Mute mic" : "Unmute mic"}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            <Button
              variant={camOn ? "default" : "outline"}
              size="icon"
              onClick={toggleCam}
              className="h-12 w-12 rounded-full"
              title={camOn ? "Stop camera" : "Start camera"}
            >
              {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </Button>
            <Button
              variant={speakerOn ? "default" : "outline"}
              size="icon"
              onClick={toggleSpeaker}
              className="h-12 w-12 rounded-full"
              title={speakerOn ? "Mute speaker" : "Unmute speaker"}
            >
              {speakerOn ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={() => navigate("/dashboard")}
              className="h-12 w-12 rounded-full"
              title="Leave room"
            >
              <PhoneOff className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Right: secondary controls (reactions moved into chat panel) */}
        <div className="flex items-center gap-2">
          <Button
            variant={myHand ? "default" : "outline"}
            size="sm"
            onClick={toggleHand}
            className={myHand ? "animate-pulse" : ""}
            title="Raise hand"
          >
            <Hand className="h-4 w-4" />
          </Button>
          <Button
            variant={cursorsOn ? "default" : "outline"}
            size="sm"
            onClick={() => setCursorsOn((v) => !v)}
            title="Toggle collaborative cursors"
          >
            <MousePointer2 className="h-4 w-4" />
          </Button>
          <Button
            variant={chatCollapsed ? "outline" : "ghost"}
            size="sm"
            onClick={toggleChat}
            title="Toggle chat"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          <PomodoroTimer initialMinutes={timerMinutes} roomId={roomId} compact />
        </div>
      </div>
    </div>
  );
}
