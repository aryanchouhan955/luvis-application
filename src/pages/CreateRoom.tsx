import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy } from "lucide-react";

function generateRoomId() {
  return "ROOM-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function CreateRoom() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [roomId] = useState(generateRoomId());
  const [password, setPassword] = useState("");
  const [timer, setTimer] = useState(25);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const { error } = await supabase.from("rooms").insert({
      room_id: roomId,
      password_hash: password,
      timer_duration: timer * 60,
      created_by: user.id,
    });

    setLoading(false);
    if (error) {
      toast.error("Failed to create room: " + error.message);
    } else {
      toast.success("Room created!");
      navigate(`/room/${roomId}`);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border/50">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Create Study Room</CardTitle>
          <CardDescription>Set up a virtual room for collaboration</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Room ID</Label>
              <div className="flex gap-2">
                <Input readOnly value={roomId} className="font-mono" />
                <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(roomId); toast.success("Copied!"); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Room Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timer">Timer (minutes)</Label>
              <Input id="timer" type="number" min={1} max={180} value={timer} onChange={(e) => setTimer(Number(e.target.value))} />
            </div>
            <Button type="submit" className="w-full luvis-gradient text-white" disabled={loading}>
              {loading ? "Creating..." : "Create Room"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
