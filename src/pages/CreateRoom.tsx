import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";

function generateRoomId() {
  return "ROOM-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function CreateRoom() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [roomId] = useState(generateRoomId());
  const [requirePassword, setRequirePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(25);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const totalMinutes = hours * 60 + minutes;

  const handleCopy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    toast.success("Copied!");
    setTimeout(() => setter(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (totalMinutes < 1) {
      toast.error("Timer must be at least 1 minute.");
      return;
    }
    if (requirePassword && !password.trim()) {
      toast.error("Please enter a password or disable the password option.");
      return;
    }
    setLoading(true);

    const { error } = await supabase.from("rooms").insert({
      room_id: roomId,
      password_hash: requirePassword ? password : null,
      timer_duration: totalMinutes * 60,
      created_by: user.id,
    });

    setLoading(false);
    if (error) {
      toast.error("Failed to create room: " + error.message);
      return;
    }

    toast.success("Room created!");
    const params = new URLSearchParams({ roomId });
    if (requirePassword) params.set("password", password);
    const link = `${window.location.origin}/join-room?${params.toString()}`;
    setShareLink(link);
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
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(roomId, setCopiedId)}
                  aria-label="Copy room ID"
                >
                  {copiedId ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
              <div>
                <Label htmlFor="require-password" className="cursor-pointer">Require password</Label>
                <p className="text-xs text-muted-foreground">Off: anyone with the Room ID can join</p>
              </div>
              <Switch
                id="require-password"
                checked={requirePassword}
                onCheckedChange={setRequirePassword}
              />
            </div>

            {requirePassword && (
              <div className="space-y-2">
                <Label htmlFor="password">Room Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set a password"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Timer</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    id="hours"
                    type="number"
                    min={0}
                    max={12}
                    value={hours}
                    onChange={(e) => setHours(Math.max(0, Number(e.target.value)))}
                  />
                  <p className="mt-1 text-xs text-muted-foreground text-center">Hours</p>
                </div>
                <div>
                  <Input
                    id="minutes"
                    type="number"
                    min={0}
                    max={59}
                    value={minutes}
                    onChange={(e) => setMinutes(Math.max(0, Math.min(59, Number(e.target.value))))}
                  />
                  <p className="mt-1 text-xs text-muted-foreground text-center">Minutes</p>
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full luvis-gradient text-white" disabled={loading}>
              {loading ? "Creating..." : "Create Room"}
            </Button>
          </form>

          {shareLink && (
            <div className="mt-6 space-y-2">
              <Label>Shareable Join Link</Label>
              <div className="flex gap-2">
                <Input readOnly value={shareLink} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(shareLink, setCopiedLink)}
                  aria-label="Copy link"
                >
                  {copiedLink ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Anyone with this link can join the room{requirePassword ? " (password embedded)" : ""}.
              </p>
              <Button
                type="button"
                className="w-full luvis-gradient text-white"
                onClick={() => navigate(`/room/${roomId}`)}
              >
                Enter Room
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
