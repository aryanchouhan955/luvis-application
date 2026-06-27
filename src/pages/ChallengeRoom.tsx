import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { ChallengeTimer } from "@/components/timer/ChallengeTimer";
import { VideoGrid } from "@/components/room/VideoGrid";
import { MediaControls } from "@/components/room/MediaControls";
import { useWebRTC } from "@/hooks/useWebRTC";
import { ChallengeLeaderboard } from "@/components/challenge/ChallengeLeaderboard";
import { AnswerReview } from "@/components/challenge/AnswerReview";
import { ChallengeResults } from "@/components/challenge/ChallengeResults";

interface Question {
  id: string;
  question_text: string;
  options: string[] | null;
  question_type: string;
}


interface AnswerRecord {
  questionIndex: number;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  questionText: string;
  timeTaken: number;
}

export default function ChallengeRoom() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [timePerQuestion, setTimePerQuestion] = useState(60);
  const [challengeDbId, setChallengeDbId] = useState<string | null>(null);
  const questionStartTime = useRef<number>(Date.now());

  const { localStream, participants, micOn, camOn, speakerOn, toggleMic, toggleCam, toggleSpeaker } = useWebRTC(challengeId ? `challenge-${challengeId}` : "");

  useEffect(() => {
    if (!challengeId) return;

    const loadQuestions = async () => {
      const { data, error } = await supabase.rpc("get_challenge_session", {
        _challenge_id: challengeId,
      });

      const result = data as {
        success: boolean;
        error?: string;
        challenge?: { id: string; timer_seconds: number; question_count: number };
        questions?: Array<{ id: string; question_text: string; question_type: string; options: unknown }>;
      } | null;

      if (error || !result?.success || !result.challenge) {
        toast.error("Challenge not found");
        setLoading(false);
        return;
      }

      setChallengeDbId(result.challenge.id);
      const perQ = Math.max(
        10,
        Math.floor((result.challenge.timer_seconds ?? 300) / (result.challenge.question_count || 5))
      );
      setTimePerQuestion(perQ);

      const qs = result.questions ?? [];
      if (qs.length > 0) {
        setQuestions(qs.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          question_type: q.question_type,
          options: Array.isArray(q.options) ? (q.options as string[]) : null,
        })));
        questionStartTime.current = Date.now();
      } else {
        toast.error("No questions found for this challenge");
      }
      setLoading(false);
    };
    loadQuestions();
  }, [challengeId]);

  const submitAnswerRef = useRef<(timedOut: boolean) => Promise<void>>();

  const handleTimeUp = useCallback(() => {
    if (!finished && questions.length > 0) {
      submitAnswerRef.current?.(true);
    }
  }, [finished, questions.length]);

  const submitAnswer = async (timedOut = false) => {
    const question = questions[currentQ];
    const timeTaken = (Date.now() - questionStartTime.current) / 1000;
    const userAnswer = timedOut ? "" : answer;

    const { data } = await supabase.rpc("submit_quiz_answer", {
      _question_id: question.id,
      _user_answer: userAnswer,
    });
    const grade = data as { success: boolean; is_correct?: boolean; correct_answer?: string } | null;
    const isCorrect = !!grade?.is_correct;
    const correctAnswer = grade?.correct_answer ?? "";

    if (isCorrect) {
      setScore((v) => v + 1);
      toast.success("Correct! ✅");
    } else if (timedOut) {
      toast.error(`Time's up! Correct: ${correctAnswer}`);
    } else {
      toast.error(`Wrong! Correct: ${correctAnswer}`);
    }

    setAnswers((prev) => [...prev, {
      questionIndex: currentQ,
      userAnswer,
      correctAnswer,
      isCorrect,
      questionText: question.question_text,
      timeTaken: Math.round(timeTaken),
    }]);

    if (currentQ + 1 < questions.length) {
      setCurrentQ((v) => v + 1);
      setAnswer("");
      questionStartTime.current = Date.now();
    } else {
      const finalScore = score + (isCorrect ? 1 : 0);
      setFinished(true);

      if (user && challengeDbId) {
        const totalTime = answers.reduce((sum, a) => sum + a.timeTaken, 0) + Math.round(timeTaken);
        await supabase.rpc("record_challenge_score", {
          _challenge_id: challengeDbId,
          _score: finalScore,
          _total_questions: questions.length,
          _time_taken_seconds: totalTime,
        });
      }
    }
  };

  submitAnswerRef.current = submitAnswer;

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading challenge...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <Card className="w-full max-w-md border-border/50 text-center">
          <CardContent className="p-8 space-y-4">
            <p className="text-lg font-medium">No questions found for this challenge.</p>
            <Button onClick={() => navigate("/dashboard")} className="luvis-gradient text-white">Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (finished) {
    return (
      <ChallengeResults
        score={score}
        questions={questions}
        answers={answers}
        challengeDbId={challengeDbId}
        userId={user?.id}
        onBack={() => navigate("/dashboard")}
      />
    );
  }

  const question = questions[currentQ];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <h2 className="font-semibold">Challenge: <span className="font-mono text-primary">{challengeId}</span></h2>
        <p className="text-sm text-muted-foreground">Question {currentQ + 1}/{questions.length}</p>
      </div>

      {/* Mobile sidebar */}
      <div className="border-b border-border bg-card p-3 lg:hidden">
        <div className="space-y-3">
          <VideoGrid localStream={localStream} participants={participants} speakerOn={speakerOn} />
          <ChallengeTimer timeLimit={timePerQuestion} questionIndex={currentQ} roomId={challengeId} onTimeUp={handleTimeUp} />
          <div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">Your Score</p>
            <p className="text-2xl font-bold text-primary">{score}/{questions.length}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden w-64 flex-col gap-2 border-r border-border bg-card p-3 lg:flex">
          <VideoGrid localStream={localStream} participants={participants} speakerOn={speakerOn} />
          <ChallengeTimer timeLimit={timePerQuestion} questionIndex={currentQ} roomId={challengeId} onTimeUp={handleTimeUp} />
          <div className="mt-auto rounded-lg border border-border bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">Your Score</p>
            <p className="text-2xl font-bold text-primary">{score}/{questions.length}</p>
          </div>
        </div>

        {/* Question area */}
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <Card className="w-full max-w-xl border-border/50">
            <CardHeader>
              <CardTitle className="text-xl">{question.question_text}</CardTitle>
              <p className="text-xs text-muted-foreground">{question.question_type === "mcq" ? "Multiple Choice" : "Text Answer"}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {question.question_type === "mcq" && question.options ? (
                <RadioGroup value={answer} onValueChange={setAnswer}>
                  {question.options.map((option, index) => (
                    <div key={index} className="flex items-center space-x-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                      <RadioGroupItem value={option} id={`opt-${index}`} />
                      <Label htmlFor={`opt-${index}`} className="flex-1 cursor-pointer">{option}</Label>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <Input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type your answer..."
                  className="text-lg"
                />
              )}
              <Button onClick={() => submitAnswer(false)} disabled={!answer.trim()} className="w-full luvis-gradient text-white">
                {currentQ + 1 < questions.length ? "Submit & Next" : "Submit & Finish"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <MediaControls
        micOn={micOn}
        camOn={camOn}
        speakerOn={speakerOn}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleSpeaker={toggleSpeaker}
        onLeave={() => navigate("/dashboard")}
      />
    </div>
  );
}
