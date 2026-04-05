import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Clock } from "lucide-react";
import { WhiteboardCanvas } from "@/components/whiteboard/WhiteboardCanvas";
import { CodeEditorPanel } from "@/components/editor/CodeEditorPanel";
import { Notepad } from "@/components/room/Notepad";
import { PomodoroTimer } from "@/components/timer/PomodoroTimer";

export default function StudyRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [room, setRoom] = useState<any>(null);
  const [showTimer, setShowTimer] = useState(false);

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

  const leaveRoom = () => {
    navigate("/dashboard");
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Room: <span className="font-mono text-primary">{roomId}</span></h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowTimer(!showTimer)}>
            <Clock className="mr-1 h-4 w-4" /> Timer
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Video sidebar */}
        <div className="hidden w-64 flex-col gap-2 border-r border-border bg-card p-3 lg:flex">
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Participants</p>
          {/* Self video placeholder */}
          <div className="flex aspect-video items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
            {camOn ? "📹 You" : user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          {/* Placeholder for other participants */}
          <div className="flex aspect-video items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
            Waiting...
          </div>
          {showTimer && (
            <div className="mt-auto">
              <PomodoroTimer initialMinutes={room?.timer_duration ? Math.floor(room.timer_duration / 60) : 25} />
            </div>
          )}
        </div>

        {/* Workspace */}
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

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-3 border-t border-border bg-card px-4 py-3">
        <Button variant={micOn ? "default" : "outline"} size="icon" onClick={() => setMicOn(!micOn)} className="rounded-full h-12 w-12">
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        <Button variant={camOn ? "default" : "outline"} size="icon" onClick={() => setCamOn(!camOn)} className="rounded-full h-12 w-12">
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
        <Button variant="destructive" size="icon" onClick={leaveRoom} className="rounded-full h-12 w-12">
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
