import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Participant {
  userId: string;
  stream: MediaStream | null;
  email?: string;
}

export interface PresenceUser {
  userId: string;
  email?: string;
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function useWebRTC(channelName: string) {
  const { user } = useAuth();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const upsertParticipant = useCallback((userId: string, updates: Partial<Participant>) => {
    setParticipants((prev) => {
      const existing = prev.find((participant) => participant.userId === userId);

      if (existing) {
        return prev.map((participant) =>
          participant.userId === userId
            ? {
                ...participant,
                ...updates,
                userId,
                stream: updates.stream ?? participant.stream,
                email: updates.email ?? participant.email,
              }
            : participant
        );
      }

      return [...prev, { userId, stream: updates.stream ?? null, email: updates.email }];
    });
  }, []);

  const createOfferForPeer = useCallback(async (remoteUserId: string) => {
    const pc = peerConnections.current.get(remoteUserId);

    if (!pc || !channelRef.current || !user?.id || pc.signalingState !== "stable") {
      return;
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      channelRef.current.send({
        type: "broadcast",
        event: "offer",
        payload: {
          sdp: offer,
          from: user.id,
          to: remoteUserId,
        },
      });
    } catch (error) {
      console.error("Offer error:", error);
    }
  }, [user?.id]);

  const renegotiateAllPeers = useCallback(async () => {
    await Promise.all(
      Array.from(peerConnections.current.keys()).map((remoteUserId) => createOfferForPeer(remoteUserId))
    );
  }, [createOfferForPeer]);

  const attachLocalTracksToPeers = useCallback((stream: MediaStream) => {
    peerConnections.current.forEach((pc) => {
      const existingKinds = new Set(
        pc.getSenders().map((sender) => sender.track?.kind).filter(Boolean)
      );

      stream.getTracks().forEach((track) => {
        if (!existingKinds.has(track.kind)) {
          pc.addTrack(track, stream);
          existingKinds.add(track.kind);
        }
      });
    });
  }, []);

  const flushPendingIceCandidates = useCallback(async (remoteUserId: string, pc: RTCPeerConnection) => {
    const candidates = pendingIceCandidates.current.get(remoteUserId) ?? [];

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("ICE candidate error:", error);
      }
    }

    pendingIceCandidates.current.delete(remoteUserId);
  }, []);

  const createPeerConnection = useCallback((remoteUserId: string, email?: string) => {
    const existingConnection = peerConnections.current.get(remoteUserId);

    if (existingConnection) {
      if (email) {
        upsertParticipant(remoteUserId, { email });
      }
      return existingConnection;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current && user?.id) {
        channelRef.current.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: {
            candidate: event.candidate.toJSON(),
            from: user.id,
            to: remoteUserId,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      upsertParticipant(remoteUserId, {
        stream: event.streams[0] ?? null,
        email,
      });
    };

    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        peerConnections.current.delete(remoteUserId);
        pendingIceCandidates.current.delete(remoteUserId);
        setParticipants((prev) => prev.filter((participant) => participant.userId !== remoteUserId));
      }
    };

    peerConnections.current.set(remoteUserId, pc);

    if (email) {
      upsertParticipant(remoteUserId, { email });
    }

    return pc;
  }, [upsertParticipant, user?.id]);

  const startMedia = useCallback(async (audio: boolean, video: boolean) => {
    if (!audio && !video) {
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio,
        video: video ? { width: 320, height: 240, frameRate: 15 } : false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicOn(audio);
      setCamOn(video);

      attachLocalTracksToPeers(stream);
      void renegotiateAllPeers();

      return stream;
    } catch (error) {
      console.error("Media access error:", error);
      return null;
    }
  }, [attachLocalTracksToPeers, renegotiateAllPeers]);

  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();

      if (audioTracks.length > 0) {
        const nextEnabled = !audioTracks[0].enabled;
        audioTracks.forEach((track) => {
          track.enabled = nextEnabled;
        });
        setMicOn(nextEnabled);
      } else if (!micOn) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          const audioTrack = stream.getAudioTracks()[0];

          if (!audioTrack || !localStreamRef.current) {
            return;
          }

          localStreamRef.current.addTrack(audioTrack);
          attachLocalTracksToPeers(localStreamRef.current);
          setMicOn(true);
          void renegotiateAllPeers();
        }).catch((error) => {
          console.error("Mic access error:", error);
        });
      }
    } else {
      void startMedia(true, camOn);
    }
  }, [attachLocalTracksToPeers, camOn, micOn, renegotiateAllPeers, startMedia]);

  const toggleCam = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();

      if (videoTracks.length > 0) {
        const nextEnabled = !videoTracks[0].enabled;
        videoTracks.forEach((track) => {
          track.enabled = nextEnabled;
        });
        setCamOn(nextEnabled);
      } else if (!camOn) {
        navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, frameRate: 15 } }).then((stream) => {
          const videoTrack = stream.getVideoTracks()[0];

          if (!videoTrack || !localStreamRef.current) {
            return;
          }

          localStreamRef.current.addTrack(videoTrack);
          attachLocalTracksToPeers(localStreamRef.current);
          setCamOn(true);
          void renegotiateAllPeers();
        }).catch((error) => {
          console.error("Camera access error:", error);
        });
      }
    } else {
      void startMedia(micOn, true);
    }
  }, [attachLocalTracksToPeers, camOn, micOn, renegotiateAllPeers, startMedia]);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!channelName || !user) return;

    const channel = supabase.channel(`webrtc-${channelName}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "user-joined" }, async ({ payload }) => {
        if (payload.userId === user.id) return;

        upsertParticipant(payload.userId, { email: payload.email });
        createPeerConnection(payload.userId, payload.email);
        await createOfferForPeer(payload.userId);
      })
      .on("broadcast", { event: "offer" }, async ({ payload }) => {
        if (payload.to !== user.id) return;

        const pc = createPeerConnection(payload.from);

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await flushPendingIceCandidates(payload.from, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          channel.send({
            type: "broadcast",
            event: "answer",
            payload: { sdp: answer, from: user.id, to: payload.from },
          });
        } catch (error) {
          console.error("Answer error:", error);
        }
      })
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        if (payload.to !== user.id) return;

        const pc = peerConnections.current.get(payload.from);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await flushPendingIceCandidates(payload.from, pc);
          } catch (error) {
            console.error("Remote description error:", error);
          }
        }
      })
      .on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
        if (payload.to !== user.id) return;

        const pc = peerConnections.current.get(payload.from);

        if (!pc || !pc.remoteDescription) {
          const queuedCandidates = pendingIceCandidates.current.get(payload.from) ?? [];
          queuedCandidates.push(payload.candidate);
          pendingIceCandidates.current.set(payload.from, queuedCandidates);
          return;
        }

        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (error) {
          console.error("ICE candidate error:", error);
        }
      })
      .on("broadcast", { event: "user-left" }, ({ payload }) => {
        const pc = peerConnections.current.get(payload.userId);
        if (pc) {
          pc.close();
        }

        peerConnections.current.delete(payload.userId);
        pendingIceCandidates.current.delete(payload.userId);
        setParticipants((prev) => prev.filter((participant) => participant.userId !== payload.userId));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.send({
            type: "broadcast",
            event: "user-joined",
            payload: { userId: user.id, email: user.email },
          });
        }
      });

    return () => {
      channel.send({
        type: "broadcast",
        event: "user-left",
        payload: { userId: user.id },
      });
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      pendingIceCandidates.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setParticipants([]);
      supabase.removeChannel(channel);
    };
  }, [channelName, user, createOfferForPeer, createPeerConnection, flushPendingIceCandidates, upsertParticipant]);

  return {
    localStream,
    participants,
    micOn,
    camOn,
    speakerOn,
    toggleMic,
    toggleCam,
    toggleSpeaker,
    startMedia,
  };
}
