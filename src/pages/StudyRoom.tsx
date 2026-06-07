import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Hand, Link2, MousePointer2, Check } from "lucide-react";
import { toast } from "sonner";
import { WhiteboardCanvas } from "@/components/whiteboard/WhiteboardCanvas";
import { CodeEditorPanel } from "@/components/editor/CodeEditorPanel";
import { Notepad } from "@/components/room/Notepad";
import { PomodoroTimer } from "@/components/timer/PomodoroTimer";
import { VideoGrid } from "@/components/room/VideoGrid";
import { MediaControls } from "@/components/room/MediaControls";
import { SharedTopicEditor } from "@/components/room/SharedTopicEditor";
import { ChatPanel } from "@/components/room/ChatPanel";
import { ActivityLog, logActivity } from "@/components/room/ActivityLog";
import { ReactionsBar } from "@/components/room/ReactionsBar";
import { CollabCursors } from "@/components/room/CollabCursors";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useStudyTracker } from "@/hooks/useStudyTracker";

export default function StudyRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState<any>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});
  const [myHand, setMyHand] = useState(false);
  const [cursorsOn, setCursorsOn] = useState(true);
  const [copied, setCopied] = useState(false);
  const handChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useStudyTracker(!!roomId);

  const { localStream, participants, micOn, camOn, speakerOn, toggleMic, toggleCam, toggleSpeaker } = useWebRTC(roomId || "");

  const timerMinutes = room?.timer_duration ? Math.max(1, Math.ceil(room.timer_duration / 60)) : 25;

  useEffect(() => {
    if (!roomId) return;
    supabase.from("rooms").select("*").eq("room_id", roomId).maybeSingle()
      .then(({ data }) => { if (data) setRoom(data); });
  }, [roomId]);

  // Raise-hand channel + activity log emit join/leave
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
        payload: { userId: user.id, raised: next, name: user.email?.split("@")[0] || "User" },
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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">
            Room: <span className="font-mono text-primary">{roomId}</span>
          </h2>
          <Button variant="outline" size="sm" onClick={copyInvite}>
            {copied ? <Check className="mr-1 h-4 w-4 text-primary" /> : <Link2 className="mr-1 h-4 w-4" />}
            {copied ? "Copied" : "Copy Invite Link"}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <ReactionsBar roomId={roomId || ""} />
          <Button
            variant={myHand ? "default" : "outline"}
            size="sm"
            onClick={toggleHand}
            className={myHand ? "animate-pulse" : ""}
          >
            <Hand className="mr-1 h-4 w-4" />
            {myHand ? "Lower Hand" : "Raise Hand"}
          </Button>
          <Button
            variant={cursorsOn ? "default" : "outline"}
            size="sm"
            onClick={() => setCursorsOn((v) => !v)}
            title="Toggle collaborative cursors"
          >
            <MousePointer2 className="mr-1 h-4 w-4" />
            Cursors
          </Button>
          {/* Top-right Focus Timer */}
          <div className="ml-2 w-56">
            <PomodoroTimer initialMinutes={timerMinutes} roomId={roomId} />
          </div>
        </div>
      </div>

      {/* Main horizontal area */}
      <div className="flex flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Participants */}
          <ResizablePanel defaultSize={18} minSize={12} maxSize={35}>
            <div className="flex h-full flex-col gap-2 border-r border-border bg-card p-3">
              <VideoGrid
                localStream={localStream}
                participants={participants}
                speakerOn={speakerOn}
                raisedHands={raisedHands}
                localUserId={user?.id}
                localRaised={myHand}
              />
              <div className="mt-2 flex-1 overflow-hidden rounded-lg border border-border">
                <ActivityLog roomId={roomId || ""} />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Workspace + topic vertically split */}
          <ResizablePanel defaultSize={60} minSize={30}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={12} minSize={8} maxSize={30}>
                <div className="h-full bg-card px-4 py-3">
                  <SharedTopicEditor
                    roomId={roomId || ""}
                    onChangeNotify={(t) => logActivity(roomId || "", `Topic updated: "${t.slice(0, 60)}"`)}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={88}>
                <Tabs defaultValue="whiteboard" className="flex h-full flex-col">
                  <div className="border-b border-border px-4">
                    <TabsList className="bg-transparent">
                      <TabsTrigger value="whiteboard">Whiteboard</TabsTrigger>
                      <TabsTrigger value="notepad">Notepad</TabsTrigger>
                      <TabsTrigger value="code">Code Editor</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="whiteboard" className="m-0 flex-1 overflow-hidden">
                    <CollabCursors roomId={roomId || ""} panel="whiteboard" enabled={cursorsOn}>
                      <WhiteboardCanvas roomId={roomId || ""} />
                    </CollabCursors>
                  </TabsContent>
                  <TabsContent value="notepad" className="m-0 flex-1 overflow-hidden p-4">
                    <CollabCursors roomId={roomId || ""} panel="notepad" enabled={cursorsOn}>
                      <Notepad roomId={roomId} />
                    </CollabCursors>
                  </TabsContent>
                  <TabsContent value="code" className="m-0 flex-1 overflow-hidden">
                    <CollabCursors roomId={roomId || ""} panel="code" enabled={cursorsOn}>
                      <CodeEditorPanel roomId={roomId || ""} />
                    </CollabCursors>
                  </TabsContent>
                </Tabs>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Chat */}
          <ResizablePanel defaultSize={22} minSize={chatOpen ? 14 : 3} maxSize={40}>
            <ChatPanel roomId={roomId || ""} open={chatOpen} onToggle={() => setChatOpen((v) => !v)} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <MediaControls
        micOn={micOn}
        camOn={camOn}
        speakerOn={speakerOn}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleSpeaker={toggleSpeaker}
        onLeave={() => navigate("/dashboard")}
      />
    </div>
  );
}
