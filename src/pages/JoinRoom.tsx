import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function JoinRoom() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [roomId, setRoomId] = useState(searchParams.get("roomId") ?? "");
  const [password, setPassword] = useState(searchParams.get("password") ?? "");
  const [loading, setLoading] = useState(false);
  const autoJoinRef = useState({ tried: false })[0];

  const submit = async (rid: string, pwd: string) => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase.rpc("join_room", {
      _room_id: rid.trim(),
      _password: pwd,
    });

    setLoading(false);

    const result = data as { success: boolean; error?: string } | null;
    if (error || !result?.success) {
      const code = result?.error;
      if (code === "not_found") toast.error("Room not found or inactive.");
      else if (code === "invalid_password") toast.error("Incorrect password.");
      else toast.error("Could not join room.");
      return;
    }

    toast.success("Joined room!");
    navigate(`/room/${rid.trim()}`);
  };

  // Auto-join when link contains roomId (and optional password)
  useEffect(() => {
    const qRoom = searchParams.get("roomId");
    if (!qRoom || !user || autoJoinRef.tried) return;
    autoJoinRef.tried = true;
    submit(qRoom, searchParams.get("password") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(roomId, password);
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border/50">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Join Study Room</CardTitle>
          <CardDescription>Enter the room credentials to join</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="roomId">Room ID</Label>
              <Input id="roomId" required value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="ROOM-XXXXXX" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password <span className="text-xs text-muted-foreground">(leave blank if none)</span></Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Room password (optional)" />
            </div>
            <Button type="submit" className="w-full luvis-gradient text-white" disabled={loading}>
              {loading ? "Joining..." : "Join Room"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
