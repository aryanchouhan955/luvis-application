import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const [roomId, setRoomId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const { data: room, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("room_id", roomId.trim())
      .eq("is_active", true)
      .maybeSingle();

    if (error || !room) {
      setLoading(false);
      toast.error("Room not found or inactive.");
      return;
    }

    if (room.password_hash !== password) {
      setLoading(false);
      toast.error("Incorrect password.");
      return;
    }

    // Add participant
    await supabase.from("room_participants").upsert({
      room_id: room.id,
      user_id: user.id,
    });

    setLoading(false);
    toast.success("Joined room!");
    navigate(`/room/${roomId.trim()}`);
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
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Room password" />
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
