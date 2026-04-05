import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function JoinChallenge() {
  const navigate = useNavigate();
  const [challengeId, setChallengeId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: challenge, error } = await supabase
      .from("challenges")
      .select("*")
      .eq("challenge_id", challengeId.trim())
      .eq("is_active", true)
      .maybeSingle();

    if (error || !challenge) {
      setLoading(false);
      toast.error("Challenge not found or inactive.");
      return;
    }

    if (challenge.password_hash !== password) {
      setLoading(false);
      toast.error("Incorrect password.");
      return;
    }

    setLoading(false);
    toast.success("Joined challenge!");
    navigate(`/challenge/${challengeId.trim()}`);
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border/50">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Join Challenge</CardTitle>
          <CardDescription>Enter credentials to join a quiz battle</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="challengeId">Challenge ID</Label>
              <Input id="challengeId" required value={challengeId} onChange={(e) => setChallengeId(e.target.value)} placeholder="CHAL-XXXXXX" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Challenge password" />
            </div>
            <Button type="submit" className="w-full luvis-gradient text-white" disabled={loading}>
              {loading ? "Joining..." : "Join Challenge"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
