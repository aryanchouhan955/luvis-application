

# LUVIS — Implementation Plan

## Important Platform Constraints

Lovable builds **React + Vite + Tailwind** frontends. It does not support Node.js/Express servers or MongoDB directly. Instead, we use **Supabase** (Lovable Cloud) for authentication, database (PostgreSQL), and edge functions. Real-time features use Supabase Realtime channels. Video/audio uses WebRTC via peer-to-peer connections.

This means the MERN stack translates to:
- **MongoDB → Supabase PostgreSQL**
- **Express/Node → Supabase Edge Functions + RLS policies**
- **JWT/bcrypt → Supabase Auth (built-in)**
- **Socket.io → Supabase Realtime channels**

The UI, routing, Recharts, Monaco Editor, Canvas whiteboard, and WebRTC video all work as requested.

---

## Build Phases (Adapted)

### Phase 1: Foundation & Auth
- Enable Lovable Cloud (Supabase) for auth + database
- Create tables: `profiles`, `rooms`, `challenges`, `quiz_questions`, `quiz_scores`, `user_stats`
- Build auth pages: Login, Signup with email/password
- Protected route wrapper component
- Profile auto-creation trigger on signup

### Phase 2: Homepage & Layout
- Responsive landing page with LUVIS branding
- Navigation bar with auth state awareness
- Action buttons: Login, Signup, Create Room, Join Room, Create Challenge, Join Challenge, Dashboard
- Dark/light theme toggle
- App shell layout component

### Phase 3: Dashboard & Analytics
- Study hours line chart (Recharts)
- Quiz accuracy bar chart
- Streak heatmap display
- Recent rooms list
- Performance summary cards
- Pull data from `user_stats` table

### Phase 4: Room System (Create & Join)
- Create Room form: generates unique room ID, password, timer duration
- Join Room form: validates room ID + password
- Store rooms in Supabase `rooms` table with RLS

### Phase 5: Virtual Study Room
- Room page with timer countdown (synced via Supabase Realtime)
- Tabbed workspace: Whiteboard, Notepad, Code Editor
- Video grid using WebRTC (peer-to-peer via signaling through Supabase Realtime)
- Bottom control bar: mic/camera toggle, leave button
- Participant list sidebar

### Phase 6: Whiteboard
- Canvas API drawing with tool selection (pen, eraser, clear)
- Real-time sync of strokes via Supabase Realtime broadcast

### Phase 7: Code Editor
- Monaco Editor integration with language selector
- Live collaboration sync via Supabase Realtime

### Phase 8: Focus Timer
- Pomodoro timer with start/pause/reset
- Synced across room participants via Realtime

### Phase 9: Challenge System
- Create challenge: ID, password, timer, question type (MCQ/text/coding), question count
- Join challenge: validate credentials
- Store in `challenges` + `quiz_questions` tables

### Phase 10: Challenge Room & Quiz Engine
- Challenge room UI with participant video grid
- Question panel with MCQ/text answer input
- Score tracking, submit/next controls
- Leaderboard display
- Results summary on completion

---

## Technical Architecture

```text
src/
  components/
    layout/        — Navbar, Sidebar, AppShell, ThemeToggle
    auth/          — LoginForm, SignupForm, ProtectedRoute
    room/          — CreateRoom, JoinRoom, RoomView, VideoGrid
    whiteboard/    — WhiteboardCanvas
    editor/        — CodeEditor (Monaco)
    timer/         — PomodoroTimer
    challenge/     — CreateChallenge, JoinChallenge, ChallengeRoom
    quiz/          — QuestionPanel, Leaderboard
    dashboard/     — StatsCards, Charts, StreakHeatmap
    ui/            — (existing shadcn components)
  pages/
    Index, Login, Signup, Dashboard,
    CreateRoom, JoinRoom, StudyRoom,
    CreateChallenge, JoinChallenge, ChallengeRoom
  hooks/           — useAuth, useRoom, useWebRTC, useTimer, useWhiteboard
  lib/             — supabase client, utils
  types/           — TypeScript interfaces
```

### Database Tables
- `profiles` — name, username, avatar, study_hours, quiz_score, study_streak
- `rooms` — room_id, password_hash, timer_duration, created_by, is_active
- `room_participants` — room_id, user_id, joined_at
- `challenges` — challenge_id, password_hash, timer, question_type, created_by
- `quiz_questions` — challenge_id, question_text, options, correct_answer, type
- `quiz_scores` — challenge_id, user_id, score, completed_at
- `user_stats` — user_id, date, study_minutes, quizzes_taken, accuracy

### Key Dependencies to Add
- `recharts` — analytics charts
- `@monaco-editor/react` — code editor
- `next-themes` — dark/light mode (already partially present)

---

## Implementation Order

Given the scope, I will build this iteratively across multiple messages:

1. **First** — Supabase setup + Auth + Homepage + Navigation (Phases 1-2)
2. **Second** — Dashboard with charts (Phase 3)
3. **Third** — Room create/join + Study Room UI (Phases 4-5)
4. **Fourth** — Whiteboard + Code Editor + Timer (Phases 6-8)
5. **Fifth** — Challenge system + Quiz engine (Phases 9-10)

Each step will produce working, testable UI before moving on.

