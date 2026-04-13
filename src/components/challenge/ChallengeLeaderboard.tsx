import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ScoreEntry {
  user_id: string;
  score: number;
  total_questions: number;
  time_taken_seconds: number;
  displayName?: string;
}

interface Props {
  challengeDbId: string | null;
  userId?: string;
}

export function ChallengeLeaderboard({ challengeDbId, userId }: Props) {
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    if (!challengeDbId) return;

    const load = async () => {
      const { data: scores } = await supabase
        .from("quiz_scores")
        .select("*")
        .eq("challenge_id", challengeDbId)
        .order("score", { ascending: false });

      if (!scores || scores.length === 0) return;

      const userIds = scores.map((s) => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, username")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p.name || p.username || p.user_id.slice(0, 8)]));

      // Sort: score DESC, then time ASC
      const sorted = scores
        .map((s) => ({
          user_id: s.user_id,
          score: s.score,
          total_questions: s.total_questions,
          time_taken_seconds: (s as any).time_taken_seconds ?? 0,
          displayName: profileMap.get(s.user_id) || s.user_id.slice(0, 8),
        }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.time_taken_seconds - b.time_taken_seconds;
        });

      setLeaderboard(sorted);
    };
    load();
  }, [challengeDbId]);

  if (leaderboard.length === 0) return null;

  const userRank = leaderboard.findIndex((e) => e.user_id === userId) + 1;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-lg">🏆 Leaderboard</CardTitle>
        {userRank > 0 && <p className="text-sm text-muted-foreground">Your Rank: <span className="font-bold text-primary">#{userRank}</span></p>}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {leaderboard.map((entry, index) => (
            <div
              key={entry.user_id}
              className={`flex items-center justify-between rounded-lg p-3 ${
                entry.user_id === userId ? "bg-primary/10 border border-primary/30" : "bg-muted/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  index === 0 ? "bg-yellow-500/20 text-yellow-500" : index === 1 ? "bg-gray-400/20 text-gray-400" : index === 2 ? "bg-orange-500/20 text-orange-500" : "bg-muted text-muted-foreground"
                }`}>
                  #{index + 1}
                </span>
                <div>
                  <span className="font-medium">{entry.displayName}{entry.user_id === userId ? " (You)" : ""}</span>
                  <p className="text-xs text-muted-foreground">{entry.time_taken_seconds}s total</p>
                </div>
              </div>
              <span className="font-bold text-primary">{entry.score}/{entry.total_questions}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
