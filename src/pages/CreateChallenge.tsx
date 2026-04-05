import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy } from "lucide-react";

function generateChallengeId() {
  return "CHAL-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function CreateChallenge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [challengeId] = useState(generateChallengeId());
  const [password, setPassword] = useState("");
  const [timer, setTimer] = useState(5);
  const [questionType, setQuestionType] = useState("mcq");
  const [questionCount, setQuestionCount] = useState(5);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const { error } = await supabase.from("challenges").insert({
      challenge_id: challengeId,
      password_hash: password,
      timer_seconds: timer * 60,
      question_type: questionType,
      question_count: questionCount,
      created_by: user.id,
    });

    setLoading(false);
    if (error) {
      toast.error("Failed: " + error.message);
    } else {
      toast.success("Challenge created!");
      navigate(`/challenge/${challengeId}`);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border/50">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Create Challenge</CardTitle>
          <CardDescription>Set up a quiz battle challenge</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Challenge ID</Label>
              <div className="flex gap-2">
                <Input readOnly value={challengeId} className="font-mono" />
                <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(challengeId); toast.success("Copied!"); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a password" />
            </div>
            <div className="space-y-2">
              <Label>Question Type</Label>
              <Select value={questionType} onValueChange={setQuestionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">Multiple Choice</SelectItem>
                  <SelectItem value="text">Text Answer</SelectItem>
                  <SelectItem value="coding">Coding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timer">Timer (min)</Label>
                <Input id="timer" type="number" min={1} max={60} value={timer} onChange={(e) => setTimer(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="count">Questions</Label>
                <Input id="count" type="number" min={1} max={50} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} />
              </div>
            </div>
            <Button type="submit" className="w-full luvis-gradient text-white" disabled={loading}>
              {loading ? "Creating..." : "Create Challenge"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
