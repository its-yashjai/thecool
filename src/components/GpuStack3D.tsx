import React, { useEffect, useRef } from 'react';
import { Cpu, Wind, Thermometer, Zap, Layers } from 'lucide-react';

interface GpuStack3DProps {
  temperature: number;
  fanSpeed: number;
  power: number;
  controller: 'PID' | 'NeuralFlow';
}

export const GpuStack3D: React.FC<GpuStack3DProps> = ({
  temperature,
  fanSpeed,
  power,
  controller
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameId = useRef<number>(0);
  const fanAngle = useRef<number>(0);

  // Compute thermal color based on temperature
  const getThermalColor = (temp: number) => {
    if (temp < 50) return { r: 46, g: 213, b: 115 }; // Green
    if (temp < 70) return { r: 30, g: 144, b: 255 }; // Blue
    if (temp < 80) return { r: 255, g: 165, b: 2 };  // Amber
    return { r: 255, g: 71, b: 87 };                 // Red
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || 700);
    let height = (canvas.height = 380);

    const handleResize = () => {
      if (canvas.parentElement) {
        width = canvas.width = canvas.parentElement.clientWidth;
        height = canvas.height = 380;
      }
    };
    window.addEventListener('resize', handleResize);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Background subtle grid
      ctx.strokeStyle = 'rgba(100, 100, 220, 0.08)';
      ctx.lineWidth = 1;
      const gridSize = 30;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const centerX = width / 2;
      const centerY = height / 2 + 10;
      const col = getThermalColor(temperature);

      // ── 1. PCB Base Plate (Isometric Layer 1) ──────────────────────
      const pcbY = centerY + 80;
      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX - 220, pcbY);
      ctx.lineTo(centerX + 220, pcbY);
      ctx.lineTo(centerX + 180, pcbY + 50);
      ctx.lineTo(centerX - 260, pcbY + 50);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Gold contacts & circuits
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)';
      ctx.lineWidth = 1.5;
      for (let i = -180; i <= 180; i += 24) {
        ctx.beginPath();
        ctx.moveTo(centerX + i, pcbY + 45);
        ctx.lineTo(centerX + i + 10, pcbY + 45);
        ctx.stroke();
      }
      ctx.restore();

      // ── 2. Silicon Die / GPU Core (Isometric Layer 2) ─────────────
      const dieY = centerY + 40;
      ctx.save();
      // Glowing core glow
      const grad = ctx.createRadialGradient(centerX, dieY + 15, 5, centerX, dieY + 15, 90);
      grad.addColorStop(0, `rgba(${col.r}, ${col.g}, ${col.b}, 0.8)`);
      grad.addColorStop(0.5, `rgba(${col.r}, ${col.g}, ${col.b}, 0.3)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(centerX - 120, dieY - 30, 240, 90);

      // Die polygon
      ctx.fillStyle = `rgb(${Math.floor(col.r * 0.7)}, ${Math.floor(col.g * 0.7)}, ${Math.floor(col.b * 0.7)})`;
      ctx.strokeStyle = `rgb(${col.r}, ${col.g}, ${col.b})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX - 80, dieY);
      ctx.lineTo(centerX + 80, dieY);
      ctx.lineTo(centerX + 60, dieY + 40);
      ctx.lineTo(centerX - 100, dieY + 40);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Core text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`GPU DIE: ${temperature.toFixed(1)}°C`, centerX - 10, dieY + 24);
      ctx.restore();

      // ── 3. Vapor Chamber & Heatpipes (Layer 3) ───────────────────
      const vcY = centerY - 10;
      ctx.save();
      ctx.fillStyle = 'rgba(217, 119, 6, 0.4)';
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX - 160, vcY);
      ctx.lineTo(centerX + 160, vcY);
      ctx.lineTo(centerX + 140, vcY + 30);
      ctx.lineTo(centerX - 180, vcY + 30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Heatpipes
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      [-100, -50, 0, 50, 100].forEach(hpX => {
        ctx.beginPath();
        ctx.moveTo(centerX + hpX, vcY + 25);
        ctx.lineTo(centerX + hpX + 10, vcY - 40);
        ctx.stroke();
      });
      ctx.restore();

      // ── 4. Aluminum Fin Array / Heatsink (Layer 4) ─────────────────
      const finY = centerY - 60;
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.5;
      for (let fx = -170; fx <= 170; fx += 8) {
        ctx.beginPath();
        ctx.moveTo(centerX + fx, finY + 30);
        ctx.lineTo(centerX + fx + 8, finY - 20);
        ctx.stroke();
      }
      ctx.restore();

      // ── 5. Dual Axial Cooling Fans (Top Layer) ────────────────────
      fanAngle.current += (fanSpeed / 100.0) * 0.25;
      const fanPositions = [centerX - 85, centerX + 85];
      const fanY = centerY - 95;

      fanPositions.forEach((fx, idx) => {
        ctx.save();
        ctx.translate(fx, fanY);

        // Fan shroud
        ctx.strokeStyle = controller === 'NeuralFlow' ? 'rgba(46, 213, 115, 0.5)' : 'rgba(255, 71, 87, 0.5)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 50, 0, Math.PI * 2);
        ctx.stroke();

        // Airflow velocity lines
        if (fanSpeed > 25) {
          ctx.strokeStyle = controller === 'NeuralFlow' ? 'rgba(46, 213, 115, 0.25)' : 'rgba(255, 71, 87, 0.25)';
          ctx.lineWidth = 1;
          for (let a = 0; a < 6; a++) {
            const rad = ((fanAngle.current + a * 1.05) % (Math.PI * 2));
            ctx.beginPath();
            ctx.arc(0, 0, 55 + (a % 3) * 6, rad, rad + 0.4);
            ctx.stroke();
          }
        }

        // Fan Hub
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();

        // 7 Fan Blades
        ctx.fillStyle = controller === 'NeuralFlow' ? '#2ed573' : '#ff4757';
        for (let b = 0; b < 7; b++) {
          const bladeAngle = fanAngle.current + (b * (Math.PI * 2)) / 7;
          ctx.save();
          ctx.rotate(bladeAngle);
          ctx.beginPath();
          ctx.ellipse(26, 0, 20, 6, 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Hub Cap
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`FAN ${idx + 1}`, 0, 3);
        ctx.restore();
      });

      animFrameId.current = requestAnimationFrame(render);
    };

    animFrameId.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animFrameId.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [temperature, fanSpeed, power, controller]);

  return (
    <div id="gpu-stack-3d-container" className="relative rounded-2xl bg-[#0d0d24] border border-[#1e1e4a] p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#2ed573]" />
          <h3 className="text-base font-semibold text-white tracking-wide">3D GPU Thermal Stack Assembly</h3>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1e1e45] text-indigo-300 font-mono">
            {controller} Control
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Thermometer className="w-3.5 h-3.5 text-amber-400" />
            Core: <strong className="text-white">{temperature.toFixed(1)}°C</strong>
          </span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Wind className="w-3.5 h-3.5 text-sky-400" />
            Fan: <strong className="text-white">{fanSpeed.toFixed(1)}%</strong>
          </span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            Power: <strong className="text-white">{power.toFixed(1)}W</strong>
          </span>
        </div>
      </div>

      <div className="relative w-full h-[380px] rounded-xl overflow-hidden bg-gradient-to-b from-[#0a0a1a] via-[#0d0d22] to-[#070714] border border-white/5 flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full block" />
        <div className="absolute bottom-3 left-4 flex gap-4 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#2ed573]"></span> &lt;60°C Nominal</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ffa502]"></span> 70-80°C Warning</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ff4757]"></span> &gt;85°C Throttling</span>
        </div>
      </div>
    </div>
  );
};
