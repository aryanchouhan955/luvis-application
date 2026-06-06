import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { BookOpen, Clock, Flame, Target, Trophy, Medal } from "lucide-react";

interface UserStat {
  date: string;
  study_minutes: number;
  quizzes_taken: number;
  accuracy: number;
}

interface Profile {
  name: string;
  username: string;
  study_hours: number;
  quiz_score: number;
  study_streak: number;
  max_streak: number;
  created_at: string;
}

const DAYS_YEAR = 365;

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStat[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roomCount, setRoomCount] = useState(0);
  const [rank, setRank] = useState<{ position: number; total: number } | null>(null);
  const [range, setRange] = useState<"7" | "30">("7");
  const [quizScores, setQuizScores] = useState<{ score: number; total_questions: number; submitted_at: string; challenges: { challenge_id: string } | null }[]>([]);

  useEffect(() => {
    if (!user) return;

    // Stats - last 365 days for heatmap, also enough for graphs
    const since = new Date();
    since.setDate(since.getDate() - DAYS_YEAR);
    supabase
      .from("user_stats")
      .select("date, study_minutes, quizzes_taken, accuracy")
      .eq("user_id", user.id)
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: true })
      .then(({ data }) => { if (data) setStats(data as UserStat[]); });

    // Profile
    supabase
      .from("profiles")
      .select("name, username, study_hours, quiz_score, study_streak, max_streak, created_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setProfile(data as Profile); });

    // Rooms joined
    supabase
      .from("room_participants")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => setRoomCount(count ?? 0));

    // Quiz scores history (last 20 attempts) with challenge text id
    supabase
      .from("quiz_scores")
      .select("score, total_questions, submitted_at, challenges(challenge_id)")
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: true })
      .limit(20)
      .then(({ data }) => { if (data) setQuizScores(data as any); });

    // Ranking — users who signed in within the last 30 days
    (async () => {
      const { data: ranking } = await supabase.rpc("get_active_user_ranking");
      const list = (ranking ?? []) as { user_id: string }[];
      if (list.length === 0) { setRank({ position: 1, total: 1 }); return; }
      const idx = list.findIndex((r) => r.user_id === user.id);
      setRank({
        position: idx >= 0 ? idx + 1 : list.length + 1,
        total: Math.max(list.length, 1),
      });
    })();

  }, [user]);

  // Determine if first-time user — created within the last 5 minutes & no stats yet
  const isFirstTime = useMemo(() => {
    if (!profile) return false;
    const created = new Date(profile.created_at).getTime();
    const fresh = Date.now() - created < 5 * 60 * 1000;
    return fresh && stats.length === 0;
  }, [profile, stats.length]);

  const displayName =
    profile?.name?.trim() ||
    profile?.username?.trim() ||
    user?.email?.split("@")[0] ||
    "Learner";

  // ---------- Study Hours graph ----------
  const studyData = useMemo(() => {
    const days = range === "7" ? 7 : 30;
    const map = new Map(stats.map((s) => [s.date, s.study_minutes]));
    const out: { day: string; hours: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const minutes = Number(map.get(key) ?? 0);
      out.push({
        day: range === "7"
          ? d.toLocaleDateString(undefined, { weekday: "short" })
          : `${d.getMonth() + 1}/${d.getDate()}`,
        hours: +(minutes / 60).toFixed(2),
      });
    }
    return out;
  }, [stats, range]);

  // ---------- Quiz accuracy graph ----------
  const quizData = useMemo(() => {
    if (quizScores.length === 0) return [{ quiz: "—", accuracy: 0 }];
    return quizScores.map((q, i) => ({
      quiz: `Q${i + 1}`,
      accuracy: q.total_questions > 0 ? Math.round((q.score / q.total_questions) * 100) : 0,
    }));
  }, [quizScores]);

  const avgAccuracy = useMemo(() => {
    if (quizScores.length === 0) return 0;
    const total = quizScores.reduce((a, q) => a + (q.total_questions > 0 ? (q.score / q.total_questions) * 100 : 0), 0);
    return Math.round(total / quizScores.length);
  }, [quizScores]);

  const totalStudyHours = Number(profile?.study_hours ?? 0);

  const summaryStats = [
    { icon: Clock, label: "Study Hours", value: `${totalStudyHours.toFixed(1)} hrs`, color: "text-primary" },
    { icon: Target, label: "Avg Accuracy", value: `${avgAccuracy}%`, color: "text-accent" },
    { icon: Flame, label: "Current Streak", value: `${profile?.study_streak ?? 0} days`, color: "text-orange-500" },
    { icon: Trophy, label: "Longest Streak", value: `${profile?.max_streak ?? 0} days`, color: "text-yellow-500" },
    { icon: Medal, label: "Rank", value: rank ? `#${rank.position} / ${rank.total}` : "—", color: "text-primary" },
    { icon: BookOpen, label: "Rooms Joined", value: String(roomCount), color: "text-accent" },
  ];

  // ---------- 365-day heatmap ----------
  const heatmap = useMemo(() => {
    const map = new Map(stats.map((s) => [s.date, Number(s.study_minutes)]));
    const cells: { date: string; minutes: number; level: 0 | 1 | 2 | 3 | 4 }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Align so columns are weeks (Sun-Sat). Start at Sunday of (today - 364)
    const start = new Date(today);
    start.setDate(start.getDate() - (DAYS_YEAR - 1));
    start.setDate(start.getDate() - start.getDay()); // back to Sunday
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay())); // forward to Saturday
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const minutes = map.get(key) ?? 0;
      const inRange = d <= today && d >= new Date(today.getTime() - (DAYS_YEAR - 1) * 86400000);
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (inRange) {
        if (minutes >= 90) level = 4;
        else if (minutes >= 30) level = 3;
        else if (minutes >= 10) level = 2;
        else if (minutes > 0) level = 1;
      }
      cells.push({ date: key, minutes, level });
    }
    // Group into weeks (columns of 7)
    const weeks: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [stats]);

  const totalActiveDays = stats.filter((s) => s.study_minutes > 0).length;

  const levelClass: Record<number, string> = {
    0: "bg-muted",
    1: "bg-primary/20",
    2: "bg-primary/40",
    3: "bg-primary/70",
    4: "bg-primary",
  };

  const monthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    heatmap.forEach((week, col) => {
      const firstDay = week[0];
      if (!firstDay) return;
      const m = new Date(firstDay.date).getMonth();
      if (m !== lastMonth) {
        labels.push({ col, label: new Date(firstDay.date).toLocaleString(undefined, { month: "short" }) });
        lastMonth = m;
      }
    });
    return labels;
  }, [heatmap]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {isFirstTime ? `Welcome ${displayName} 👋` : `Welcome back, ${displayName} 👋`}
        </h1>
        <p className="text-muted-foreground">
          {isFirstTime ? "Glad to have you here. Let's start your first study session." : `Keep the streak going.`}
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {summaryStats.map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold leading-tight">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Study Hours</CardTitle>
            <Tabs value={range} onValueChange={(v) => setRange(v as "7" | "30")}>
              <TabsList className="h-8">
                <TabsTrigger value="7" className="h-6 px-3 text-xs">7d</TabsTrigger>
                <TabsTrigger value="30" className="h-6 px-3 text-xs">30d</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={studyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs" interval={range === "30" ? 4 : 0} />
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
                <YAxis className="text-xs" domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="accuracy" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap */}
      <Card className="mt-4 border-border/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Study Activity (Last 365 Days)</CardTitle>
          <span className="text-xs text-muted-foreground">{totalActiveDays} active days</span>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div className="relative ml-8" style={{ height: 16 }}>
              {monthLabels.map((m) => (
                <span
                  key={`${m.col}-${m.label}`}
                  className="absolute text-[10px] text-muted-foreground"
                  style={{ left: m.col * 14 }}
                >
                  {m.label}
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <div className="mr-1 flex flex-col gap-[3px] pt-[1px] text-[10px] text-muted-foreground">
                {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
                  <div key={i} className="h-[11px] leading-[11px]">{d}</div>
                ))}
              </div>
              <div className="flex gap-[3px]">
                {heatmap.map((week, ci) => (
                  <div key={ci} className="flex flex-col gap-[3px]">
                    {week.map((cell) => (
                      <div
                        key={cell.date}
                        title={`${cell.date}: ${cell.minutes} min`}
                        className={`h-[11px] w-[11px] rounded-sm ${levelClass[cell.level]}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((l) => (
                <div key={l} className={`h-[11px] w-[11px] rounded-sm ${levelClass[l]}`} />
              ))}
              <span>More</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
