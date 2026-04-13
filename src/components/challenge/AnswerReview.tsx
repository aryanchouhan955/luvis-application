import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, ChevronDown, ChevronUp } from "lucide-react";

interface AnswerRecord {
  questionIndex: number;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  questionText: string;
  timeTaken: number;
}

interface Props {
  answers: AnswerRecord[];
}

export function AnswerReview({ answers }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-lg">📝 Answer Review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {answers.map((a, i) => (
          <div key={i} className="rounded-lg border border-border overflow-hidden">
            <button
              className={`flex w-full items-center gap-3 p-3 text-left ${a.isCorrect ? "bg-green-500/5" : "bg-red-500/5"}`}
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${a.isCorrect ? "bg-green-500/20" : "bg-red-500/20"}`}>
                {a.isCorrect ? <Check className="h-4 w-4 text-green-500" /> : <X className="h-4 w-4 text-red-500" />}
              </span>
              <span className="flex-1 text-sm font-medium">Q{i + 1}: {a.questionText}</span>
              <span className="text-xs text-muted-foreground mr-2">{a.timeTaken}s</span>
              {expanded === i ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {expanded === i && (
              <div className="border-t border-border p-3 space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Your answer: </span>
                  <span className={a.isCorrect ? "text-green-500 font-medium" : "text-red-500 font-medium line-through"}>
                    {a.userAnswer || "(no answer)"}
                  </span>
                </p>
                {!a.isCorrect && (
                  <p>
                    <span className="text-muted-foreground">Correct answer: </span>
                    <span className="text-green-500 font-medium">{a.correctAnswer}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
