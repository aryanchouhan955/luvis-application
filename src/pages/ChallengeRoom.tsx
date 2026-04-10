import { useState, useEffect } from "react";
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
import { PomodoroTimer } from "@/components/timer/PomodoroTimer";
import { VideoGrid } from "@/components/room/VideoGrid";
import { MediaControls } from "@/components/room/MediaControls";
import { useWebRTC } from "@/hooks/useWebRTC";

interface Question {
  id: string;
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  question_type: string;
}

interface ScoreEntry {
  user_id: string;
  score: number;
  total_questions: number;
  email?: string;
}

interface AnswerRecord {
  questionIndex: number;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  questionText: string;
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
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [expandedReview, setExpandedReview] = useState<number | null>(null);
  const [userRank, setUserRank] = useState(0);
  const [timerMinutes, setTimerMinutes] = useState(25);

  const { localStream, participants, micOn, camOn, speakerOn, toggleMic, toggleCam, toggleSpeaker } = useWebRTC(challengeId ? `challenge-${challengeId}` : "");

  useEffect(() => {
    if (!challengeId) return;

    const loadQuestions = async () => {
      const { data: challenge } = await supabase
        .from("challenges")
        .select("id, timer_seconds")
        .eq("challenge_id", challengeId)
        .maybeSingle();

      if (!challenge) {
        toast.error("Challenge not found");
        setLoading(false);
        return;
      }

      setTimerMinutes(Math.max(1, Math.ceil((challenge.timer_seconds ?? 1500) / 60)));

      const { data: qs } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("challenge_id", challenge.id);

      if (qs && qs.length > 0) {
        setQuestions(qs.map((q) => ({
          ...q,
          options: Array.isArray(q.options) ? (q.options as string[]) : null,
        })));
      } else {
        toast.error("No questions found for this challenge");
      }
      setLoading(false);
    };
    loadQuestions();
  }, [challengeId]);

  useEffect(() => {
    if (!finished || !challengeId) return;

    const loadLeaderboard = async () => {
      const { data: challenge } = await supabase
        .from("challenges")
        .select("id")
        .eq("challenge_id", challengeId)
        .maybeSingle();

      if (!challenge) return;

      const { data: scores } = await supabase
        .from("quiz_scores")
        .select("*")
        .eq("challenge_id", challenge.id)
        .order("score", { ascending: false });

      if (scores) {
        const enriched: ScoreEntry[] = scores.map((s) => ({
          user_id: s.user_id,
          score: s.score,
          total_questions: s.total_questions,
        }));

        const userIds = enriched.map((entry) => entry.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name, username")
          .in("user_id", userIds);

        const profileMap = new Map(profiles?.map((profile) => [profile.user_id, profile.name || profile.username || profile.user_id.slice(0, 8)]));

        setLeaderboard(enriched.map((entry) => ({
          ...entry,
          email: profileMap.get(entry.user_id) || entry.user_id.slice(0, 8),
        })));

        const rank = enriched.findIndex((entry) => entry.user_id === user?.id);
        setUserRank(rank >= 0 ? rank + 1 : 0);
      }
    };
    loadLeaderboard();
  }, [finished, challengeId, user?.id]);

  const submitAnswer = async () => {
    const question = questions[currentQ];
    const isCorrect = answer.trim().toLowerCase() === question.correct_answer.trim().toLowerCase();

    if (isCorrect) {
      setScore((value) => value + 1);
      toast.success("Correct! ✅");
    } else {
      toast.error(`Wrong! Correct: ${question.correct_answer}`);
    }

    setAnswers((prev) => [...prev, {
      questionIndex: currentQ,
      userAnswer: answer,
      correctAnswer: question.correct_answer,
      isCorrect,
      questionText: question.question_text,
    }]);

    if (currentQ + 1 < questions.length) {
      setCurrentQ((value) => value + 1);
      setAnswer("");
    } else {
      const finalScore = score + (isCorrect ? 1 : 0);
      setFinished(true);

      if (user && challengeId) {
        const { data: challenge } = await supabase
          .from("challenges")
          .select("id")
          .eq("challenge_id", challengeId)
          .maybeSingle();

        if (challenge) {
          await supabase.from("quiz_scores").insert({
            challenge_id: challenge.id,
            user_id: user.id,
            score: finalScore,
            total_questions: questions.length,
          });
        }
      }
    }
  };

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
            <p className="text-sm text-muted-foreground">The challenge creator hasn't added questions yet.</p>
            <Button onClick={() => navigate("/dashboard")} className="luvis-gradient text-white">Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (finished) {
    const finalScore = score;
    const percentage = Math.round((finalScore / questions.length) * 100);

    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Card className="border-border/50 text-center mb-6">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full luvis-gradient">
              <Trophy className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Challenge Complete!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-5xl font-bold luvis-gradient-text">{finalScore}/{questions.length}</p>
            <p className="text-lg text-muted-foreground">Accuracy: {percentage}%</p>
            {userRank > 0 && (
              <p className="text-lg font-semibold">
                Your Rank: <span className="text-primary">#{userRank}</span>
              </p>
            )}
            <p className="text-muted-foreground">
              {percentage === 100 ? "Perfect score! 🎉" : percentage >= 70 ? "Great job! 👏" : percentage >= 40 ? "Good effort! 💪" : "Keep practicing! 📚"}
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => setShowReview(!showReview)}>
                {showReview ? "Hide Review" : "Review Answers"}
              </Button>
              <Button onClick={() => navigate("/dashboard")} className="luvis-gradient text-white">
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>

        {leaderboard.length > 0 && (
          <Card className="border-border/50 mb-6">
            <CardHeader>
              <CardTitle className="text-lg">🏆 Leaderboard</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {leaderboard.map((entry, index) => (
                  <div
                    key={entry.user_id}
                    className={`flex items-center justify-between rounded-lg p-3 ${
                      entry.user_id === user?.id ? "bg-primary/10 border border-primary/30" : "bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                        index === 0 ? "bg-yellow-500/20 text-yellow-500" : index === 1 ? "bg-gray-400/20 text-gray-400" : index === 2 ? "bg-orange-500/20 text-orange-500" : "bg-muted text-muted-foreground"
                      }`}>
                        #{index + 1}
                      </span>
                      <span className="font-medium">{entry.email}{entry.user_id === user?.id ? " (You)" : ""}</span>
                    </div>
                    <span className="font-bold text-primary">{entry.score}/{entry.total_questions}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {showReview && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">📝 Answer Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {answers.map((answerRecord, index) => (
                <div key={index} className="rounded-lg border border-border overflow-hidden">
                  <button
                    className={`flex w-full items-center gap-3 p-3 text-left ${answerRecord.isCorrect ? "bg-green-500/5" : "bg-red-500/5"}`}
                    onClick={() => setExpandedReview(expandedReview === index ? null : index)}
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full ${answerRecord.isCorrect ? "bg-green-500/20" : "bg-red-500/20"}`}>
                      {answerRecord.isCorrect ? <Check className="h-4 w-4 text-green-500" /> : <X className="h-4 w-4 text-red-500" />}
                    </span>
                    <span className="flex-1 text-sm font-medium">Q{index + 1}: {answerRecord.questionText}</span>
                    {expandedReview === index ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {expandedReview === index && (
                    <div className="border-t border-border p-3 space-y-2 text-sm">
                      <p>
                        <span className="text-muted-foreground">Your answer: </span>
                        <span className={answerRecord.isCorrect ? "text-green-500 font-medium" : "text-red-500 font-medium line-through"}>
                          {answerRecord.userAnswer || "(no answer)"}
                        </span>
                      </p>
                      {!answerRecord.isCorrect && (
                        <p>
                          <span className="text-muted-foreground">Correct answer: </span>
                          <span className="text-green-500 font-medium">{answerRecord.correctAnswer}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const question = questions[currentQ];
  const timerChannelId = challengeId ? `challenge-${challengeId}` : undefined;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <h2 className="font-semibold">Challenge: <span className="font-mono text-primary">{challengeId}</span></h2>
        <p className="text-sm text-muted-foreground">Question {currentQ + 1}/{questions.length}</p>
      </div>

      <div className="border-b border-border bg-card p-3 lg:hidden">
        <div className="space-y-3">
          <VideoGrid localStream={localStream} participants={participants} speakerOn={speakerOn} />
          <PomodoroTimer initialMinutes={timerMinutes} roomId={timerChannelId} />
          <div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">Your Score</p>
            <p className="text-2xl font-bold text-primary">{score}/{questions.length}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-64 flex-col gap-2 border-r border-border bg-card p-3 lg:flex">
          <VideoGrid localStream={localStream} participants={participants} speakerOn={speakerOn} />
          <PomodoroTimer initialMinutes={timerMinutes} roomId={timerChannelId} />
          <div className="mt-auto rounded-lg border border-border bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">Your Score</p>
            <p className="text-2xl font-bold text-primary">{score}/{questions.length}</p>
          </div>
        </div>

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
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Type your answer..."
                  className="text-lg"
                />
              )}
              <Button onClick={submitAnswer} disabled={!answer.trim()} className="w-full luvis-gradient text-white">
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
