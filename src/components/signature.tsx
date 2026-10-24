'use client';
import { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';
export function Signature({
  onChange,
  file,
}: {
  onChange: (file: File | null) => void;
  file?: File;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    point = useRef({ x: 30, y: 110 }),
    length = useRef(0);
  const [hasInk, setHasInk] = useState(false);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    if (!file) {
      context.clearRect(0, 0, 720, 220);
      length.current = 0;
      setHasInk(false);
      return;
    }
    let active = true;
    const url = URL.createObjectURL(file),
      image = new Image();
    image.onload = () => {
      if (active && !drawing.current) {
        context.clearRect(0, 0, 720, 220);
        context.drawImage(image, 0, 0, 720, 220);
        length.current = Math.max(length.current, 20);
        setHasInk(true);
      }
    };
    image.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  const draw = (x: number, y: number) => {
    const ctx = canvas.current!.getContext('2d')!;
    ctx.strokeStyle = '#164e59';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(point.current.x, point.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    length.current += Math.hypot(x - point.current.x, y - point.current.y);
    point.current = { x, y };
  };
  const save = () => {
    if (length.current > 12) {
      setHasInk(true);
      canvas.current!.toBlob((b) => {
        if (b) onChange(new File([b], 'signature.png', { type: 'image/png' }));
      });
    }
  };
  const position = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * 720) / r.width, y: ((e.clientY - r.top) * 220) / r.height };
  };
  return (
    <div className="signature-wrap">
      <div className="label-row">
        <span className="field-label">
          <PenLine size={16} /> Çizim imzanız
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            canvas.current!.getContext('2d')!.clearRect(0, 0, 720, 220);
            length.current = 0;
            setHasInk(false);
            onChange(null);
          }}
        >
          <Eraser size={15} /> Temizle
        </button>
      </div>
      <div className={`signature-pad ${hasInk ? 'has-ink' : ''}`}>
        <canvas
          ref={canvas}
          width={720}
          height={220}
          tabIndex={0}
          role="img"
          aria-label="İmza çizim alanı"
          aria-describedby="signature-help"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            point.current = position(e);
          }}
          onPointerMove={(e) => {
            if (drawing.current) {
              const p = position(e);
              draw(p.x, p.y);
            }
          }}
          onPointerUp={() => {
            drawing.current = false;
            save();
          }}
          onPointerCancel={() => {
            drawing.current = false;
            save();
          }}
          onKeyDown={(e) => {
            const delta: Record<string, [number, number]> = {
              ArrowLeft: [-8, 0],
              ArrowRight: [8, 0],
              ArrowUp: [0, -8],
              ArrowDown: [0, 8],
            };
            const d = delta[e.key];
            if (!d) return;
            e.preventDefault();
            const x = Math.max(2, Math.min(718, point.current.x + d[0])),
              y = Math.max(2, Math.min(218, point.current.y + d[1]));
            if (e.shiftKey) {
              draw(x, y);
              save();
            } else point.current = { x, y };
          }}
        />
        {!hasInk && <span className="signature-placeholder">İmzanızı bu alana çizin</span>}
      </div>
      <small id="signature-help">
        Parmağınızla veya farenizle çizin. Klavye: oklarla konumlanın, Shift + oklarla çizin. Bu
        çizim güvenli elektronik imza değildir.
      </small>
    </div>
  );
}
