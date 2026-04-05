import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Pen, Eraser, Trash2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  roomId: string;
}

const COLORS = ["#6C5CE7", "#00B894", "#E17055", "#0984E3", "#FDCB6E", "#E84393"];

export function WhiteboardCanvas({ roomId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#6C5CE7");
  const [lineWidth, setLineWidth] = useState(3);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const imageData = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    if (imageData) {
      canvas.getContext("2d")?.putImageData(imageData, 0, 0);
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // Realtime sync
  useEffect(() => {
    const channel = supabase.channel(`whiteboard-${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "draw" }, (payload) => {
        const { from, to, strokeColor, strokeWidth, toolType } = payload.payload;
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = toolType === "eraser" ? "hsl(var(--background))" : strokeColor;
        ctx.lineWidth = toolType === "eraser" ? 20 : strokeWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      })
      .on("broadcast", { event: "clear" }, () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    lastPos.current = getPos(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !lastPos.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool === "eraser" ? "hsl(var(--background))" : color;
    ctx.lineWidth = tool === "eraser" ? 20 : lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // Broadcast stroke
    channelRef.current?.send({
      type: "broadcast",
      event: "draw",
      payload: { from: lastPos.current, to: pos, strokeColor: color, strokeWidth: lineWidth, toolType: tool },
    });

    lastPos.current = pos;
  };

  const stopDraw = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const clearBoard = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    channelRef.current?.send({ type: "broadcast", event: "clear", payload: {} });
  };

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
        <Button variant={tool === "pen" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setTool("pen")}>
          <Pen className="h-4 w-4" />
        </Button>
        <Button variant={tool === "eraser" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setTool("eraser")}>
          <Eraser className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-6 w-px bg-border" />
        {COLORS.map((c) => (
          <button
            key={c}
            className={`h-6 w-6 rounded-full border-2 transition-transform ${color === c ? "scale-110 border-foreground" : "border-transparent"}`}
            style={{ backgroundColor: c }}
            onClick={() => { setColor(c); setTool("pen"); }}
          />
        ))}
        <div className="mx-1 h-6 w-px bg-border" />
        <select
          value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
          className="h-8 rounded bg-muted px-1 text-xs"
        >
          <option value={2}>Thin</option>
          <option value={3}>Medium</option>
          <option value={6}>Thick</option>
          <option value={10}>Bold</option>
        </select>
        <div className="mx-1 h-6 w-px bg-border" />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={clearBoard}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-crosshair bg-background"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
    </div>
  );
}
