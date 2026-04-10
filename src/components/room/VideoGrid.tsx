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
  const audioRef = useRef<HTMLAudioElement>(null);

  const hasVideo = stream?.getVideoTracks().some((track) => track.enabled && track.readyState === "live") ?? false;
  const hasAudio = stream?.getAudioTracks().some((track) => track.enabled && track.readyState === "live") ?? false;

  useEffect(() => {
    const mediaElement = hasVideo ? videoRef.current : audioRef.current;

    if (!mediaElement) return;

    if (!stream) {
      mediaElement.srcObject = null;
      return;
    }

    if (mediaElement.srcObject !== stream) {
      mediaElement.srcObject = stream;
    }

    mediaElement.muted = muted || !speakerOn;
    void mediaElement.play().catch(() => undefined);
  }, [hasVideo, muted, speakerOn, stream]);

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-muted">
      {stream && hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {!muted && stream && hasAudio ? <audio ref={audioRef} autoPlay className="hidden" /> : null}
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
    <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-col">
      <p className="col-span-full mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Participants
      </p>
      <VideoTile
        stream={localStream}
        label={user?.email?.split("@")[0] || "You"}
        muted={true}
        speakerOn={speakerOn}
      />
      {participants.map((participant) => (
        <VideoTile
          key={participant.userId}
          stream={participant.stream}
          label={participant.email?.split("@")[0] || participant.userId.slice(0, 6)}
          muted={false}
          speakerOn={speakerOn}
        />
      ))}
      {participants.length === 0 && (
        <div className="col-span-full flex aspect-video items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
          Waiting for others...
        </div>
      )}
    </div>
  );
}
