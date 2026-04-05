import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Trophy } from "lucide-react";
import { toast } from "sonner";

const sampleQuestions = [
  {
    text: "What does HTML stand for?",
    options: ["Hyper Text Markup Language", "High Tech Modern Language", "Hyper Transfer Markup Language", "Home Tool Markup Language"],
    correct: "Hyper Text Markup Language",
    type: "mcq",
  },
  {
    text: "Which language is used for styling web pages?",
    options: ["HTML", "JQuery", "CSS", "XML"],
    correct: "CSS",
    type: "mcq",
  },
  {
    text: "What year was JavaScript created?",
    options: ["1990", "1995", "2000", "2005"],
    correct: "1995",
    type: "mcq",
  },
];

export default function ChallengeRoom() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const questions = sampleQuestions;
  const question = questions[currentQ];

  const submitAnswer = () => {
    if (answer === question.correct) {
      setScore((s) => s + 1);
      toast.success("Correct!");
    } else {
      toast.error(`Wrong! Answer: ${question.correct}`);
    }

    if (currentQ + 1 < questions.length) {
      setCurrentQ((q) => q + 1);
      setAnswer("");
    } else {
      setFinished(true);
      // Save score
      if (user) {
        supabase
          .from("quiz_scores")
          .insert({
            challenge_id: challengeId || "",
            user_id: user.id,
            score: score + (answer === question.correct ? 1 : 0),
            total_questions: questions.length,
          })
          .then(() => {});
      }
    }
  };

  if (finished) {
    const finalScore = score;
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <Card className="w-full max-w-md border-border/50 text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full luvis-gradient">
              <Trophy className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Challenge Complete!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-4xl font-bold luvis-gradient-text">{finalScore}/{questions.length}</p>
            <p className="text-muted-foreground">
              {finalScore === questions.length ? "Perfect score! 🎉" : finalScore > questions.length / 2 ? "Great job! 👏" : "Keep practicing! 💪"}
            </p>
            <Button onClick={() => navigate("/dashboard")} className="luvis-gradient text-white">
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <h2 className="font-semibold">Challenge: <span className="font-mono text-primary">{challengeId}</span></h2>
        <p className="text-sm text-muted-foreground">Question {currentQ + 1}/{questions.length}</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Video sidebar */}
        <div className="hidden w-64 flex-col gap-2 border-r border-border bg-card p-3 lg:flex">
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Participants</p>
          <div className="flex aspect-video items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex aspect-video items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
            Waiting...
          </div>
          <div className="mt-auto rounded-lg border border-border bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">Score</p>
            <p className="text-2xl font-bold text-primary">{score}</p>
          </div>
        </div>

        {/* Question panel */}
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <Card className="w-full max-w-xl border-border/50">
            <CardHeader>
              <CardTitle className="text-xl">{question.text}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup value={answer} onValueChange={setAnswer}>
                {question.options.map((opt, i) => (
                  <div key={i} className="flex items-center space-x-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                    <RadioGroupItem value={opt} id={`opt-${i}`} />
                    <Label htmlFor={`opt-${i}`} className="flex-1 cursor-pointer">{opt}</Label>
                  </div>
                ))}
              </RadioGroup>
              <Button onClick={submitAnswer} disabled={!answer} className="w-full luvis-gradient text-white">
                {currentQ + 1 < questions.length ? "Submit & Next" : "Submit & Finish"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-3 border-t border-border bg-card px-4 py-3">
        <Button variant={micOn ? "default" : "outline"} size="icon" onClick={() => setMicOn(!micOn)} className="rounded-full h-12 w-12">
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        <Button variant={camOn ? "default" : "outline"} size="icon" onClick={() => setCamOn(!camOn)} className="rounded-full h-12 w-12">
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
        <Button variant="destructive" size="icon" onClick={() => navigate("/dashboard")} className="rounded-full h-12 w-12">
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
