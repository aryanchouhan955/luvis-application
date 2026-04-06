import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Participant {
  userId: string;
  stream: MediaStream | null;
  email?: string;
}

export function useWebRTC(channelName: string) {
  const { user } = useAuth();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const createPeerConnection = useCallback((remoteUserId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: {
            candidate: event.candidate.toJSON(),
            from: user?.id,
            to: remoteUserId,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      setParticipants((prev) => {
        const existing = prev.find((p) => p.userId === remoteUserId);
        if (existing) {
          return prev.map((p) =>
            p.userId === remoteUserId ? { ...p, stream: event.streams[0] } : p
          );
        }
        return [...prev, { userId: remoteUserId, stream: event.streams[0] }];
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        peerConnections.current.delete(remoteUserId);
        setParticipants((prev) => prev.filter((p) => p.userId !== remoteUserId));
      }
    };

    peerConnections.current.set(remoteUserId, pc);
    return pc;
  }, [user?.id]);

  const startMedia = useCallback(async (audio: boolean, video: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audio,
        video: video ? { width: 320, height: 240, frameRate: 15 } : false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicOn(audio);
      setCamOn(video);
      return stream;
    } catch (err) {
      console.error("Media access error:", err);
      return null;
    }
  }, []);

  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach((t) => (t.enabled = !t.enabled));
        setMicOn((prev) => !prev);
      } else if (!micOn) {
        // Need to get audio
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          const audioTrack = stream.getAudioTracks()[0];
          localStreamRef.current?.addTrack(audioTrack);
          peerConnections.current.forEach((pc) => {
            pc.addTrack(audioTrack, localStreamRef.current!);
          });
          setMicOn(true);
        }).catch(console.error);
      }
    } else {
      startMedia(true, camOn);
    }
  }, [micOn, camOn, startMedia]);

  const toggleCam = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach((t) => (t.enabled = !t.enabled));
        setCamOn((prev) => !prev);
      } else if (!camOn) {
        navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } }).then((stream) => {
          const videoTrack = stream.getVideoTracks()[0];
          localStreamRef.current?.addTrack(videoTrack);
          peerConnections.current.forEach((pc) => {
            pc.addTrack(videoTrack, localStreamRef.current!);
          });
          setCamOn(true);
        }).catch(console.error);
      }
    } else {
      startMedia(micOn, true);
    }
  }, [micOn, camOn, startMedia]);

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
        const pc = createPeerConnection(payload.userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({
          type: "broadcast",
          event: "offer",
          payload: { sdp: offer, from: user.id, to: payload.userId },
        });
      })
      .on("broadcast", { event: "offer" }, async ({ payload }) => {
        if (payload.to !== user.id) return;
        const pc = createPeerConnection(payload.from);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channel.send({
          type: "broadcast",
          event: "answer",
          payload: { sdp: answer, from: user.id, to: payload.from },
        });
      })
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        if (payload.to !== user.id) return;
        const pc = peerConnections.current.get(payload.from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      })
      .on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
        if (payload.to !== user.id) return;
        const pc = peerConnections.current.get(payload.from);
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      })
      .on("broadcast", { event: "user-left" }, ({ payload }) => {
        const pc = peerConnections.current.get(payload.userId);
        if (pc) pc.close();
        peerConnections.current.delete(payload.userId);
        setParticipants((prev) => prev.filter((p) => p.userId !== payload.userId));
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
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      supabase.removeChannel(channel);
    };
  }, [channelName, user, createPeerConnection]);

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
