import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Pen, Eraser, Trash2 } from "lucide-react";

interface Props {
  roomId: string;
}

export function WhiteboardCanvas({ roomId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color] = useState("#6C5CE7");
  const lastPos = useRef<{ x: number; y: number } | null>(null);

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
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool === "eraser" ? "hsl(var(--background))" : color;
    ctx.lineWidth = tool === "eraser" ? 20 : 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
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
  };

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <div className="absolute left-3 top-3 z-10 flex gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
        <Button variant={tool === "pen" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setTool("pen")}>
          <Pen className="h-4 w-4" />
        </Button>
        <Button variant={tool === "eraser" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setTool("eraser")}>
          <Eraser className="h-4 w-4" />
        </Button>
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
