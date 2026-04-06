import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

function generateChallengeId() {
  return "CHAL-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

interface Question {
  text: string;
  type: "mcq" | "text";
  options: string[];
  correctAnswer: string;
}

export default function CreateChallenge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [challengeId] = useState(generateChallengeId());
  const [password, setPassword] = useState("");
  const [timer, setTimer] = useState(5);
  const [questionType, setQuestionType] = useState<"mcq" | "text">("mcq");
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  // New question form state
  const [newText, setNewText] = useState("");
  const [newType, setNewType] = useState<"mcq" | "text">("mcq");
  const [newOptions, setNewOptions] = useState(["", "", "", ""]);
  const [newCorrect, setNewCorrect] = useState("");
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  const addQuestion = () => {
    if (!newText.trim()) return toast.error("Question text is required");
    if (newType === "mcq" && newOptions.filter((o) => o.trim()).length < 2) return toast.error("At least 2 options required");
    if (!newCorrect.trim()) return toast.error("Correct answer is required");

    setQuestions([...questions, {
      text: newText.trim(),
      type: newType,
      options: newType === "mcq" ? newOptions.filter((o) => o.trim()) : [],
      correctAnswer: newCorrect.trim(),
    }]);
    setNewText("");
    setNewOptions(["", "", "", ""]);
    setNewCorrect("");
    setShowAddForm(false);
    toast.success("Question added!");
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (questions.length === 0) return toast.error("Add at least one question");

    setLoading(true);

    const { data: challenge, error } = await supabase.from("challenges").insert({
      challenge_id: challengeId,
      password_hash: password,
      timer_seconds: timer * 60,
      question_type: questionType,
      question_count: questions.length,
      created_by: user.id,
    }).select("id").single();

    if (error || !challenge) {
      setLoading(false);
      toast.error("Failed: " + (error?.message || "Unknown error"));
      return;
    }

    // Insert questions
    const questionRows = questions.map((q) => ({
      challenge_id: challenge.id,
      question_text: q.text,
      question_type: q.type,
      options: q.type === "mcq" ? q.options : null,
      correct_answer: q.correctAnswer,
    }));

    const { error: qError } = await supabase.from("quiz_questions").insert(questionRows);

    setLoading(false);
    if (qError) {
      toast.error("Questions failed: " + qError.message);
    } else {
      toast.success("Challenge created with " + questions.length + " questions!");
      navigate(`/challenge/${challengeId}`);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-2xl border-border/50">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Create Challenge</CardTitle>
          <CardDescription>Set up a quiz battle challenge with custom questions</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Challenge settings */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Challenge ID</Label>
                <div className="flex gap-2">
                  <Input readOnly value={challengeId} className="font-mono" />
                  <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(challengeId); toast.success("Copied!"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a password" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Default Question Type</Label>
                  <Select value={questionType} onValueChange={(v) => setQuestionType(v as "mcq" | "text")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mcq">Multiple Choice</SelectItem>
                      <SelectItem value="text">Text Answer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timer">Timer (min)</Label>
                  <Input id="timer" type="number" min={1} max={60} value={timer} onChange={(e) => setTimer(Number(e.target.value))} />
                </div>
              </div>
            </div>

            {/* Questions list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Questions ({questions.length})</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
                  <Plus className="mr-1 h-4 w-4" /> Add Question
                </Button>
              </div>

              {questions.map((q, i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" className="flex-1 text-left" onClick={() => setExpandedQ(expandedQ === i ? null : i)}>
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">{i + 1}</span>
                        <span className="text-sm font-medium">{q.text}</span>
                        {expandedQ === i ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
                      </div>
                    </button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeQuestion(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {expandedQ === i && (
                    <div className="mt-2 space-y-1 pl-8 text-sm text-muted-foreground">
                      <p>Type: {q.type === "mcq" ? "Multiple Choice" : "Text"}</p>
                      {q.type === "mcq" && <p>Options: {q.options.join(", ")}</p>}
                      <p className="text-green-500">Correct: {q.correctAnswer}</p>
                    </div>
                  )}
                </div>
              ))}

              {/* Add question form */}
              {showAddForm && (
                <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="space-y-2">
                    <Label>Question Text</Label>
                    <Textarea value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Enter your question..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={newType} onValueChange={(v) => setNewType(v as "mcq" | "text")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mcq">Multiple Choice</SelectItem>
                        <SelectItem value="text">Text Answer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newType === "mcq" && (
                    <div className="space-y-2">
                      <Label>Options</Label>
                      {newOptions.map((opt, i) => (
                        <Input
                          key={i}
                          value={opt}
                          onChange={(e) => {
                            const updated = [...newOptions];
                            updated[i] = e.target.value;
                            setNewOptions(updated);
                          }}
                          placeholder={`Option ${i + 1}`}
                        />
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Correct Answer</Label>
                    {newType === "mcq" ? (
                      <Select value={newCorrect} onValueChange={setNewCorrect}>
                        <SelectTrigger><SelectValue placeholder="Select correct option" /></SelectTrigger>
                        <SelectContent>
                          {newOptions.filter((o) => o.trim()).map((opt, i) => (
                            <SelectItem key={i} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={newCorrect} onChange={(e) => setNewCorrect(e.target.value)} placeholder="Type the correct answer" />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={addQuestion} className="luvis-gradient text-white">Add</Button>
                    <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" className="w-full luvis-gradient text-white" disabled={loading || questions.length === 0}>
              {loading ? "Creating..." : `Create Challenge (${questions.length} questions)`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
