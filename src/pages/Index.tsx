import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Code, Trophy, Users, Video, Brain, ArrowRight } from "lucide-react";

const features = [
  { icon: Users, title: "Virtual Study Rooms", desc: "Join collaborative rooms with real-time video, whiteboard, and code editor." },
  { icon: Video, title: "Video Communication", desc: "Face-to-face interaction with peers using WebRTC video calls." },
  { icon: BookOpen, title: "Shared Whiteboard", desc: "Draw, sketch, and explain concepts together in real time." },
  { icon: Code, title: "Live Code Editor", desc: "Collaborate on code with syntax highlighting and multi-language support." },
  { icon: Trophy, title: "Quiz Battles", desc: "Challenge friends with MCQ, text, and coding questions." },
  { icon: Brain, title: "Progress Analytics", desc: "Track study hours, quiz accuracy, streaks, and performance." },
];

export default function Index() {
  const { user } = useAuth();

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 py-24 md:py-36">
        <div className="absolute inset-0 -z-10 opacity-20">
          <div className="absolute left-1/4 top-1/4 h-72 w-72 rounded-full bg-primary blur-[120px]" />
          <div className="absolute right-1/4 bottom-1/4 h-72 w-72 rounded-full bg-accent blur-[120px]" />
        </div>
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            Live collaborative learning platform
          </div>
          <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight md:text-7xl">
            Study Smarter with{" "}
            <span className="luvis-gradient-text">LUVIS</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Live User Virtual Interaction System — where students connect, collaborate, and conquer challenges together in real time.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {user ? (
              <>
                <Link to="/dashboard">
                  <Button size="lg" className="luvis-gradient text-white gap-2">
                    Dashboard <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/create-room">
                  <Button size="lg" variant="outline">Create Room</Button>
                </Link>
                <Link to="/join-room">
                  <Button size="lg" variant="outline">Join Room</Button>
                </Link>
                <Link to="/create-challenge">
                  <Button size="lg" variant="outline">Create Challenge</Button>
                </Link>
                <Link to="/join-challenge">
                  <Button size="lg" variant="outline">Join Challenge</Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/signup">
                  <Button size="lg" className="luvis-gradient text-white gap-2">
                    Get Started <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="outline">Login</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight md:text-4xl">
            Everything you need to <span className="luvis-gradient-text">study together</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="group border-border/50 bg-card/50 backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-lg hover:luvis-glow">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl luvis-gradient">
                    <f.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
