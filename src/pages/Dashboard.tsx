import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BookOpen, Clock, Target, Trophy } from "lucide-react";

const studyData = [
  { day: "Mon", hours: 2.5 },
  { day: "Tue", hours: 3.2 },
  { day: "Wed", hours: 1.8 },
  { day: "Thu", hours: 4.0 },
  { day: "Fri", hours: 2.1 },
  { day: "Sat", hours: 5.5 },
  { day: "Sun", hours: 3.0 },
];

const quizData = [
  { quiz: "Q1", accuracy: 85 },
  { quiz: "Q2", accuracy: 72 },
  { quiz: "Q3", accuracy: 90 },
  { quiz: "Q4", accuracy: 68 },
  { quiz: "Q5", accuracy: 95 },
];

const streakData = Array.from({ length: 28 }, (_, i) => ({
  day: i + 1,
  active: Math.random() > 0.35,
}));

const stats = [
  { icon: Clock, label: "Study Hours", value: "22.1 hrs", color: "text-primary" },
  { icon: Target, label: "Quiz Accuracy", value: "82%", color: "text-accent" },
  { icon: Trophy, label: "Study Streak", value: "7 days", color: "text-yellow-500" },
  { icon: BookOpen, label: "Rooms Joined", value: "12", color: "text-primary" },
];

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Welcome back!</h1>
        <p className="text-muted-foreground">{user?.email}</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
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
            <CardTitle className="text-lg">Study Hours This Week</CardTitle>
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
