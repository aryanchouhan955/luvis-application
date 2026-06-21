import { useRef, useState, useEffect, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Pen, Eraser, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  roomId: string;
}

const COLORS = ["#6C5CE7", "#00B894", "#E17055", "#0984E3", "#FDCB6E", "#E84393"];

export const WhiteboardCanvas = memo(function WhiteboardCanvas({ roomId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#6C5CE7");
  const [lineWidth, setLineWidth] = useState(3);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingBroadcast = useRef<any[]>([]);
  const rafId = useRef<number | null>(null);
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const lineWidthRef = useRef(lineWidth);

  // Keep refs in sync
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { lineWidthRef.current = lineWidth; }, [lineWidth]);

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

  const drawSegment = useCallback((ctx: CanvasRenderingContext2D, from: {x:number,y:number}, to: {x:number,y:number}, strokeColor: string, strokeWidth: number, toolType: string) => {
    ctx.save();
    if (toolType === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = strokeWidth;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }, []);

  // Flush batched broadcasts using rAF
  const flushBroadcasts = useCallback(() => {
    if (pendingBroadcast.current.length > 0 && channelRef.current) {
      // Send batch
      channelRef.current.send({
        type: "broadcast",
        event: "draw-batch",
        payload: { strokes: pendingBroadcast.current },
      });
      pendingBroadcast.current = [];
    }
    rafId.current = null;
  }, []);

  const storageKey = `whiteboard-${roomId}`;

  // Restore from localStorage
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const data = localStorage.getItem(storageKey);
      if (!data) return;
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0);
      };
      img.src = data;
    } catch {}
  }, [storageKey]);

  // Realtime sync
  useEffect(() => {
    const channel = supabase.channel(`whiteboard-${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "draw-batch" }, (payload) => {
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
        const strokes = payload.payload.strokes;
        for (const s of strokes) {
          drawSegment(ctx, s.from, s.to, s.strokeColor, s.strokeWidth, s.toolType);
        }
      })
      .on("broadcast", { event: "draw" }, (payload) => {
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
        const { from, to, strokeColor, strokeWidth, toolType } = payload.payload;
        drawSegment(ctx, from, to, strokeColor, strokeWidth, toolType);
      })
      .on("broadcast", { event: "clear" }, () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
        try { localStorage.removeItem(storageKey); } catch {}
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, drawSegment, storageKey]);

  const saveSnapshot = useCallback(() => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      localStorage.setItem(storageKey, canvas.toDataURL("image/png"));
    } catch {}
  }, [storageKey]);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    isDrawing.current = true;
    lastPos.current = getPos(e);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || !lastPos.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    const currentTool = toolRef.current;
    const currentColor = colorRef.current;
    const currentWidth = currentTool === "eraser" ? 20 : lineWidthRef.current;

    drawSegment(ctx, lastPos.current, pos, currentColor, currentWidth, currentTool);

    // Batch broadcast
    pendingBroadcast.current.push({
      from: lastPos.current,
      to: pos,
      strokeColor: currentColor,
      strokeWidth: currentWidth,
      toolType: currentTool,
    });

    if (!rafId.current) {
      rafId.current = requestAnimationFrame(flushBroadcasts);
    }

    lastPos.current = pos;
  }, [getPos, drawSegment, flushBroadcasts]);

  const stopDraw = useCallback(() => {
    isDrawing.current = false;
    lastPos.current = null;
    // Flush remaining
    if (pendingBroadcast.current.length > 0) {
      flushBroadcasts();
    }
    saveSnapshot();
  }, [flushBroadcasts, saveSnapshot]);

  const clearBoard = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    channelRef.current?.send({ type: "broadcast", event: "clear", payload: {} });
  }, []);

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
});
