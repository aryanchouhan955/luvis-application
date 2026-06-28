import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Hand } from "lucide-react";
import { useSpeakingDetection } from "@/hooks/useSpeakingDetection";
import { cn } from "@/lib/utils";

interface Participant {
  userId: string;
  stream: MediaStream | null;
  email?: string;
}

interface PresenceUser {
  userId: string;
  email?: string;
}

interface VideoGridProps {
  localStream: MediaStream | null;
  participants: Participant[];
  presence?: PresenceUser[];
  speakerOn: boolean;
  raisedHands?: Record<string, boolean>;
  localUserId?: string;
  localRaised?: boolean;
}

function VideoTile({
  stream,
  label,
  muted,
  speakerOn,
  mirror,
  raised,
  isSelf,
}: {
  stream: MediaStream | null;
  label: string;
  muted: boolean;
  speakerOn: boolean;
  mirror?: boolean;
  raised?: boolean;
  isSelf?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const hasVideo = stream?.getVideoTracks().some((t) => t.enabled && t.readyState === "live") ?? false;
  const hasAudio = stream?.getAudioTracks().some((t) => t.enabled && t.readyState === "live") ?? false;

  // Self speaking via mic; remote via received stream. Skip self if muted output (still detect mic).
  const speaking = useSpeakingDetection(stream, hasAudio && (isSelf || speakerOn));

  useEffect(() => {
    const el = hasVideo ? videoRef.current : audioRef.current;
    if (!el) return;
    if (!stream) { el.srcObject = null; return; }
    if (el.srcObject !== stream) el.srcObject = stream;
    el.muted = muted || !speakerOn;
    void el.play().catch(() => undefined);
  }, [hasVideo, muted, speakerOn, stream]);

  const status = raised ? "Raised" : speaking ? "Speaking" : hasAudio || hasVideo ? "Active" : "Idle";

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-muted ring-2 ring-transparent transition-all",
        speaking && "ring-primary shadow-[0_0_20px_hsl(var(--primary)/0.6)]",
        raised && "ring-accent",
      )}
    >
      {stream && hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={cn("h-full w-full object-cover", mirror && "scale-x-[-1]")}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {!muted && stream && hasAudio ? <audio ref={audioRef} autoPlay className="hidden" /> : null}
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">
            {label.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      {raised && (
        <div className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground animate-pulse">
          <Hand className="h-4 w-4" />
        </div>
      )}
      <span className="absolute bottom-1 left-2 flex items-center gap-1 rounded bg-background/70 px-2 py-0.5 text-xs text-foreground">
        {label}
        <span
          className={cn(
            "ml-1 h-1.5 w-1.5 rounded-full",
            status === "Speaking" && "bg-primary",
            status === "Raised" && "bg-accent",
            status === "Active" && "bg-green-500",
            status === "Idle" && "bg-muted-foreground",
          )}
          title={status}
        />
      </span>
    </div>
  );
}

export function VideoGrid({ localStream, participants, presence = [], speakerOn, raisedHands = {}, localUserId, localRaised = false }: VideoGridProps) {
  const { user } = useAuth();

  // Merge presence + WebRTC streams. Presence guarantees everyone shows up
  // immediately on join and persists across refreshes.
  const streamByUser = new Map(participants.map((p) => [p.userId, p]));
  const others: Array<{ userId: string; email?: string; stream: MediaStream | null }> = presence
    .filter((p) => p.userId !== (localUserId ?? user?.id))
    .map((p) => {
      const withStream = streamByUser.get(p.userId);
      return {
        userId: p.userId,
        email: p.email ?? withStream?.email,
        stream: withStream?.stream ?? null,
      };
    });

  // Include any peer-connected participants not yet in presence (race condition safety)
  participants.forEach((p) => {
    if (p.userId === (localUserId ?? user?.id)) return;
    if (!others.find((o) => o.userId === p.userId)) others.push(p);
  });

  return (
    <div className="relative flex flex-col h-full w-full gap-2">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hidden md:block">
        Participants ({others.length + 1})
      </p>
      
      {/* Remote Participants Grid */}
      <div className="flex-1 overflow-auto grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-col gap-2 relative z-0">
        {others.length === 0 ? (
          <div className="col-span-full flex h-full min-h-[200px] w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
            Waiting for others...
          </div>
        ) : (
          others.map((p) => (
            <div key={p.userId} className="h-full min-h-[250px] lg:min-h-[150px]">
              <VideoTile
                stream={p.stream}
                label={p.email?.split("@")[0] || p.userId.slice(0, 6)}
                muted={false}
                speakerOn={speakerOn}
                raised={!!raisedHands[p.userId]}
              />
            </div>
          ))
        )}
      </div>

      {/* Local Video - Floating on Mobile, Inline on Desktop */}
      <div className="absolute right-4 bottom-4 w-28 md:w-full md:static z-20 shadow-2xl md:shadow-none transition-all">
        <VideoTile
          stream={localStream}
          label={`${user?.email?.split("@")[0] || "You"}`}
          muted
          speakerOn={speakerOn}
          mirror
          isSelf
          raised={localRaised}
        />
      </div>
    </div>
  );
}
