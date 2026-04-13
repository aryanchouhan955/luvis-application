import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { ChallengeLeaderboard } from "./ChallengeLeaderboard";
import { AnswerReview } from "./AnswerReview";

interface AnswerRecord {
  questionIndex: number;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  questionText: string;
  timeTaken: number;
}

interface Question {
  id: string;
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  question_type: string;
}

interface Props {
  score: number;
  questions: Question[];
  answers: AnswerRecord[];
  challengeDbId: string | null;
  userId?: string;
  onBack: () => void;
}

export function ChallengeResults({ score, questions, answers, challengeDbId, userId, onBack }: Props) {
  const [showReview, setShowReview] = useState(false);
  const percentage = Math.round((score / questions.length) * 100);
  const totalTime = answers.reduce((sum, a) => sum + a.timeTaken, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <Card className="border-border/50 text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full luvis-gradient">
            <Trophy className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl">Challenge Complete!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-5xl font-bold luvis-gradient-text">{score}/{questions.length}</p>
          <p className="text-lg text-muted-foreground">Accuracy: {percentage}% · Total time: {totalTime}s</p>
          <p className="text-muted-foreground">
            {percentage === 100 ? "Perfect score! 🎉" : percentage >= 70 ? "Great job! 👏" : percentage >= 40 ? "Good effort! 💪" : "Keep practicing! 📚"}
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => setShowReview(!showReview)}>
              {showReview ? "Hide Review" : "Review Answers"}
            </Button>
            <Button onClick={onBack} className="luvis-gradient text-white">Back to Dashboard</Button>
          </div>
        </CardContent>
      </Card>

      <ChallengeLeaderboard challengeDbId={challengeDbId} userId={userId} />

      {showReview && <AnswerReview answers={answers} />}
    </div>
  );
}
