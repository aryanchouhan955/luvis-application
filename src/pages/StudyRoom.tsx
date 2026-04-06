import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock } from "lucide-react";
import { WhiteboardCanvas } from "@/components/whiteboard/WhiteboardCanvas";
import { CodeEditorPanel } from "@/components/editor/CodeEditorPanel";
import { Notepad } from "@/components/room/Notepad";
import { PomodoroTimer } from "@/components/timer/PomodoroTimer";
import { VideoGrid } from "@/components/room/VideoGrid";
import { MediaControls } from "@/components/room/MediaControls";
import { useWebRTC } from "@/hooks/useWebRTC";

export default function StudyRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<any>(null);
  const [showTimer, setShowTimer] = useState(false);

  const { localStream, participants, micOn, camOn, speakerOn, toggleMic, toggleCam, toggleSpeaker, startMedia } = useWebRTC(roomId || "");

  useEffect(() => {
    if (!roomId) return;
    supabase
      .from("rooms")
      .select("*")
      .eq("room_id", roomId)
      .maybeSingle()
      .then(({ data }) => { if (data) setRoom(data); });
  }, [roomId]);

  // Auto-start media on mount
  useEffect(() => {
    startMedia(false, false);
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <h2 className="font-semibold">Room: <span className="font-mono text-primary">{roomId}</span></h2>
        <Button variant="ghost" size="sm" onClick={() => setShowTimer(!showTimer)}>
          <Clock className="mr-1 h-4 w-4" /> Timer
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-64 flex-col gap-2 border-r border-border bg-card p-3 lg:flex">
          <VideoGrid localStream={localStream} participants={participants} speakerOn={speakerOn} />
          {showTimer && (
            <div className="mt-auto">
              <PomodoroTimer initialMinutes={room?.timer_duration ? Math.floor(room.timer_duration / 60) : 25} roomId={roomId} />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="whiteboard" className="flex h-full flex-col">
            <div className="border-b border-border px-4">
              <TabsList className="bg-transparent">
                <TabsTrigger value="whiteboard">Whiteboard</TabsTrigger>
                <TabsTrigger value="notepad">Notepad</TabsTrigger>
                <TabsTrigger value="code">Code Editor</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="whiteboard" className="flex-1 m-0">
              <WhiteboardCanvas roomId={roomId || ""} />
            </TabsContent>
            <TabsContent value="notepad" className="flex-1 m-0 p-4">
              <Notepad />
            </TabsContent>
            <TabsContent value="code" className="flex-1 m-0">
              <CodeEditorPanel roomId={roomId || ""} />
            </TabsContent>
          </Tabs>
        </div>
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
