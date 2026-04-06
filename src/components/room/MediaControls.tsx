import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video, VideoOff, Volume2, VolumeX, PhoneOff } from "lucide-react";

interface MediaControlsProps {
  micOn: boolean;
  camOn: boolean;
  speakerOn: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleSpeaker: () => void;
  onLeave: () => void;
}

export function MediaControls({ micOn, camOn, speakerOn, onToggleMic, onToggleCam, onToggleSpeaker, onLeave }: MediaControlsProps) {
  return (
    <div className="flex items-center justify-center gap-3 border-t border-border bg-card px-4 py-3">
      <Button variant={micOn ? "default" : "outline"} size="icon" onClick={onToggleMic} className="rounded-full h-12 w-12">
        {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </Button>
      <Button variant={camOn ? "default" : "outline"} size="icon" onClick={onToggleCam} className="rounded-full h-12 w-12">
        {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </Button>
      <Button variant={speakerOn ? "default" : "outline"} size="icon" onClick={onToggleSpeaker} className="rounded-full h-12 w-12">
        {speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </Button>
      <Button variant="destructive" size="icon" onClick={onLeave} className="rounded-full h-12 w-12">
        <PhoneOff className="h-5 w-5" />
      </Button>
    </div>
  );
}
