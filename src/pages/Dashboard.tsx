import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BookOpen, Clock, Target, Trophy } from "lucide-react";

interface UserStat {
  date: string;
  study_minutes: number;
  quizzes_taken: number;
  accuracy: number;
}

interface Profile {
  study_hours: number;
  quiz_score: number;
  study_streak: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStat[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roomCount, setRoomCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Fetch user_stats (last 7 days)
    supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: true })
      .limit(7)
      .then(({ data }) => { if (data) setStats(data); });

    // Fetch profile
    supabase
      .from("profiles")
      .select("study_hours, quiz_score, study_streak")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setProfile(data); });

    // Count rooms joined
    supabase
      .from("room_participants")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => { setRoomCount(count ?? 0); });
  }, [user]);

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const studyData = stats.length > 0
    ? stats.map((s) => ({
        day: dayNames[new Date(s.date).getDay()],
        hours: +(s.study_minutes / 60).toFixed(1),
      }))
    : dayNames.slice(1).concat(dayNames[0]).map((d) => ({ day: d, hours: 0 }));

  const quizData = stats.length > 0
    ? stats.filter((s) => s.quizzes_taken > 0).map((s, i) => ({
        quiz: `Q${i + 1}`,
        accuracy: Number(s.accuracy),
      }))
    : [{ quiz: "No data", accuracy: 0 }];

  const totalStudyHours = profile?.study_hours ?? 0;
  const avgAccuracy = stats.length > 0
    ? Math.round(stats.reduce((a, s) => a + Number(s.accuracy), 0) / stats.length)
    : 0;

  const summaryStats = [
    { icon: Clock, label: "Study Hours", value: `${totalStudyHours} hrs`, color: "text-primary" },
    { icon: Target, label: "Avg Accuracy", value: `${avgAccuracy}%`, color: "text-accent" },
    { icon: Trophy, label: "Study Streak", value: `${profile?.study_streak ?? 0} days`, color: "text-yellow-500" },
    { icon: BookOpen, label: "Rooms Joined", value: String(roomCount), color: "text-primary" },
  ];

  // Streak heatmap — last 28 days
  const streakDays = profile?.study_streak ?? 0;
  const streakData = Array.from({ length: 28 }, (_, i) => ({
    day: i + 1,
    active: i >= 28 - streakDays,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Welcome back!</h1>
        <p className="text-muted-foreground">{user?.email}</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryStats.map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <s.icon className={`h-6 w-6 ${s.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Study Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={studyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Line type="monotone" dataKey="hours" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Quiz Accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={quizData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="quiz" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="accuracy" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Streak heatmap */}
      <Card className="mt-4 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Study Streak (Last 28 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {streakData.map((d) => (
              <div
                key={d.day}
                className={`flex h-10 items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                  d.active
                    ? "luvis-gradient text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {d.day}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
