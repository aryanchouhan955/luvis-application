import { useRef, useState, useEffect, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Pen, Eraser, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  roomId: string;
}

function pad(n: number) { return n.toString().padStart(2, "0"); }
function makeFilename(roomId: string) {
  const d = new Date();
  return `Room-${roomId}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}.png`;
}

const COLORS = ["#6C5CE7", "#00B894", "#E17055", "#0984E3", "#FDCB6E", "#E84393"];

interface StrokePayload {
  from: { x: number; y: number };
  to: { x: number; y: number };
  strokeColor: string;
  strokeWidth: number;
  toolType: "pen" | "eraser";
}

export const WhiteboardCanvas = memo(function WhiteboardCanvas({ roomId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#6C5CE7");
  const [lineWidth, setLineWidth] = useState(3);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingBroadcast = useRef<StrokePayload[]>([]);
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

  // Draw a stroke given NORMALIZED coordinates (0..1). Converted to pixels
  // using the local canvas size so every participant sees the same relative
  // line regardless of their canvas dimensions.
  const drawSegment = useCallback((
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    strokeColor: string,
    strokeWidthNorm: number,
    toolType: string,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.min(w, h);
    ctx.save();
    if (toolType === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = strokeWidthNorm * scale;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidthNorm * scale;
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x * w, from.y * h);
    ctx.lineTo(to.x * w, to.y * h);
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
    } catch (e) {
      console.warn("Failed to load whiteboard data", e);
    }
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
        try { localStorage.removeItem(storageKey); } catch (e) { console.warn("Failed to remove item", e); }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, drawSegment, storageKey]);

  const saveSnapshot = useCallback(() => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      localStorage.setItem(storageKey, canvas.toDataURL("image/png"));
    } catch (e) {
      console.warn("Failed to save whiteboard data", e);
    }
  }, [storageKey]);

  // Return NORMALIZED position (0..1) relative to the canvas.
  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
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
    // Normalize stroke width against the canvas short side so the line
    // looks the same across different participant viewports.
    const canvas = canvasRef.current;
    const refSize = canvas ? Math.min(canvas.width, canvas.height) : 600;
    const pixelWidth = currentTool === "eraser" ? 20 : lineWidthRef.current;
    const normWidth = pixelWidth / refSize;

    drawSegment(ctx, lastPos.current, pos, currentColor, normWidth, currentTool);

    pendingBroadcast.current.push({
      from: lastPos.current,
      to: pos,
      strokeColor: currentColor,
      strokeWidth: normWidth,
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
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Download whiteboard as PNG"
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            try {
              // Composite onto a white background so transparent PNG areas
              // export as the visible background color.
              const out = document.createElement("canvas");
              out.width = canvas.width;
              out.height = canvas.height;
              const octx = out.getContext("2d");
              if (!octx) return;
              octx.fillStyle = "#ffffff";
              octx.fillRect(0, 0, out.width, out.height);
              octx.drawImage(canvas, 0, 0);
              out.toBlob((blob) => {
                if (!blob) { toast.error("Export failed"); return; }
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = makeFilename(roomId);
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                toast.success("Whiteboard downloaded");
              }, "image/png");
            } catch {
              toast.error("Export failed");
            }
          }}
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={clearBoard} title="Clear whiteboard">
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
