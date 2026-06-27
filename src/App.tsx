import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { NetworkStatus } from "@/components/layout/NetworkStatus";

import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import CreateRoom from "./pages/CreateRoom";
import JoinRoom from "./pages/JoinRoom";
import StudyRoom from "./pages/StudyRoom";
import CreateChallenge from "./pages/CreateChallenge";
import JoinChallenge from "./pages/JoinChallenge";
import ChallengeRoom from "./pages/ChallengeRoom";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <NetworkStatus />
          <BrowserRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/create-room" element={<ProtectedRoute><CreateRoom /></ProtectedRoute>} />
                <Route path="/join-room" element={<ProtectedRoute><JoinRoom /></ProtectedRoute>} />
                <Route path="/room/:roomId" element={<ProtectedRoute><StudyRoom /></ProtectedRoute>} />
                <Route path="/create-challenge" element={<ProtectedRoute><CreateChallenge /></ProtectedRoute>} />
                <Route path="/join-challenge" element={<ProtectedRoute><JoinChallenge /></ProtectedRoute>} />
                <Route path="/challenge/:challengeId" element={<ProtectedRoute><ChallengeRoom /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
