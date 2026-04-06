import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface Participant {
  userId: string;
  stream: MediaStream | null;
  email?: string;
}

interface VideoGridProps {
  localStream: MediaStream | null;
  participants: Participant[];
  speakerOn: boolean;
}

function VideoTile({ stream, label, muted, speakerOn }: { stream: MediaStream | null; label: string; muted: boolean; speakerOn: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = muted;
    }
  }, [stream, muted]);

  useEffect(() => {
    if (videoRef.current && !muted) {
      videoRef.current.muted = !speakerOn;
    }
  }, [speakerOn, muted]);

  const hasVideo = stream?.getVideoTracks().some((t) => t.enabled);

  return (
    <div className="relative flex aspect-video items-center justify-center rounded-lg bg-muted overflow-hidden">
      {stream && hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">
            {label.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <span className="absolute bottom-1 left-2 rounded bg-background/70 px-2 py-0.5 text-xs text-foreground">
        {label}
      </span>
    </div>
  );
}

export function VideoGrid({ localStream, participants, speakerOn }: VideoGridProps) {
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-2">
      <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Participants</p>
      <VideoTile stream={localStream} label={user?.email?.split("@")[0] || "You"} muted={true} speakerOn={speakerOn} />
      {participants.map((p) => (
        <VideoTile
          key={p.userId}
          stream={p.stream}
          label={p.email?.split("@")[0] || p.userId.slice(0, 6)}
          muted={false}
          speakerOn={speakerOn}
        />
      ))}
      {participants.length === 0 && (
        <div className="flex aspect-video items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
          Waiting for others...
        </div>
      )}
    </div>
  );
}
