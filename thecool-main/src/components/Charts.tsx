import React, { useState, useRef } from 'react';
import { HistoryData } from '../types';

interface TemperatureChartProps {
  history: HistoryData;
  height?: number;
  showThresholds?: boolean;
}

export const TemperatureChart: React.FC<TemperatureChartProps> = ({
  history,
  height = 320,
  showThresholds = true
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const times = history.time;
  const pidTemps = history.pid_temp;
  const nfTemps = history.nf_temp;

  if (!times || times.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-zinc-500 text-sm italic bg-[#0d0d22]/50 rounded-xl border border-white/5">
        No simulation data recorded yet.
      </div>
    );
  }

  const minTime = times[0] ?? 0;
  const maxTime = times[times.length - 1] ?? 100;
  const timeSpan = Math.max(1, maxTime - minTime);

  const allTemps = [...pidTemps, ...nfTemps, 25, 95];
  const minTemp = Math.floor(Math.min(...allTemps) - 5);
  const maxTemp = Math.ceil(Math.max(...allTemps) + 5);
  const tempSpan = maxTemp - minTemp;

  const padding = { top: 25, right: 35, bottom: 35, left: 55 };
  const chartWidth = 900;
  const chartHeight = height;

  const getX = (t: number) => {
    return padding.left + ((t - minTime) / timeSpan) * (chartWidth - padding.left - padding.right);
  };

  const getY = (temp: number) => {
    return chartHeight - padding.bottom - ((temp - minTemp) / tempSpan) * (chartHeight - padding.top - padding.bottom);
  };

  const buildPath = (data: number[]) => {
    return data
      .map((val, i) => `${i === 0 ? 'M' : 'L'} ${getX(times[i])} ${getY(val)}`)
      .join(' ');
  };

  // Temperature Y grid markers
  const yTicks = [30, 45, 60, 70, 80, 85, 95].filter(t => t >= minTemp && t <= maxTemp);

  // Time X grid markers (deduplicated to prevent duplicate key warnings on short durations)
  const xTicksCount = Math.min(6, Math.max(2, timeSpan + 1));
  const rawTicks = Array.from({ length: xTicksCount }, (_, i) =>
    Math.round(minTime + (i / (xTicksCount - 1)) * timeSpan)
  );
  const xTicks = Array.from(new Set(rawTicks));

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * chartWidth;
    const clampedX = Math.max(padding.left, Math.min(chartWidth - padding.right, mouseX));
    const ratio = (clampedX - padding.left) / (chartWidth - padding.left - padding.right);
    const targetTime = minTime + ratio * timeSpan;

    // Find closest index
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(times[i] - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    setHoverIndex(closestIdx);
  };

  return (
    <div ref={containerRef} className="relative w-full rounded-2xl bg-[#0d0d22] border border-white/5 p-4 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-[#ff4757]">
            <span className="w-3 h-1 bg-[#ff4757] rounded-full inline-block"></span>
            PID Controller (Reactive)
          </span>
          <span className="flex items-center gap-1.5 text-[#2ed573]">
            <span className="w-3 h-1 bg-[#2ed573] rounded-full inline-block"></span>
            NeuralFlow (Proactive PINN)
          </span>
          {showThresholds && (
            <>
              <span className="flex items-center gap-1.5 text-[#ffa502]">
                <span className="w-3 h-0.5 border-t border-dashed border-[#ffa502] inline-block"></span>
                85°C Throttle Threshold
              </span>
              <span className="flex items-center gap-1.5 text-[#1e90ff]">
                <span className="w-3 h-0.5 border-t border-dashed border-[#1e90ff] inline-block"></span>
                70°C Target Setpoint
              </span>
            </>
          )}
        </div>

        {hoverIndex !== null && times[hoverIndex] !== undefined && (
          <div className="flex items-center gap-3 text-xs font-mono bg-[#141434] px-3 py-1 rounded-lg border border-white/10">
            <span className="text-zinc-400">t={times[hoverIndex]}s</span>
            <span className="text-[#ff4757]">PID: {pidTemps[hoverIndex]?.toFixed(1)}°C</span>
            <span className="text-[#2ed573]">NF: {nfTemps[hoverIndex]?.toFixed(1)}°C</span>
            <span className="text-sky-400">Δ: {((pidTemps[hoverIndex] ?? 0) - (nfTemps[hoverIndex] ?? 0)).toFixed(1)}°C</span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-auto cursor-crosshair select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="nfGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2ed573" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2ed573" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="pidGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff4757" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ff4757" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Y Grid lines */}
        {yTicks.map((t, idx) => (
          <g key={`y-grid-${idx}-${t}`}>
            <line
              x1={padding.left}
              y1={getY(t)}
              x2={chartWidth - padding.right}
              y2={getY(t)}
              stroke="rgba(100, 100, 220, 0.12)"
              strokeDasharray={t === 70 || t === 85 ? '4,4' : undefined}
            />
            <text
              x={padding.left - 10}
              y={getY(t) + 4}
              textAnchor="end"
              fill={t >= 85 ? '#ff4757' : t === 70 ? '#1e90ff' : '#6a6a9a'}
              fontSize="11"
              fontFamily="JetBrains Mono, monospace"
            >
              {t}°C
            </text>
          </g>
        ))}

        {/* X Grid lines */}
        {xTicks.map((t, idx) => (
          <g key={`x-grid-${idx}-${t}`}>
            <line
              x1={getX(t)}
              y1={padding.top}
              x2={getX(t)}
              y2={chartHeight - padding.bottom}
              stroke="rgba(100, 100, 220, 0.08)"
            />
            <text
              x={getX(t)}
              y={chartHeight - padding.bottom + 18}
              textAnchor="middle"
              fill="#6a6a9a"
              fontSize="11"
              fontFamily="JetBrains Mono, monospace"
            >
              {t}s
            </text>
          </g>
        ))}

        {/* Threshold lines */}
        {showThresholds && (
          <>
            {/* 85°C line */}
            <line
              x1={padding.left}
              y1={getY(85)}
              x2={chartWidth - padding.right}
              y2={getY(85)}
              stroke="#ffa502"
              strokeWidth="1.5"
              strokeDasharray="6,4"
            />
            {/* 70°C setpoint */}
            <line
              x1={padding.left}
              y1={getY(70)}
              x2={chartWidth - padding.right}
              y2={getY(70)}
              stroke="#1e90ff"
              strokeWidth="1.2"
              strokeDasharray="4,4"
            />
          </>
        )}

        {/* Area curves */}
        {times.length > 1 && (
          <>
            <path
              d={`${buildPath(pidTemps)} L ${getX(times[times.length - 1])} ${getY(minTemp)} L ${getX(times[0])} ${getY(minTemp)} Z`}
              fill="url(#pidGrad)"
            />
            <path
              d={`${buildPath(nfTemps)} L ${getX(times[times.length - 1])} ${getY(minTemp)} L ${getX(times[0])} ${getY(minTemp)} Z`}
              fill="url(#nfGrad)"
            />
          </>
        )}

        {/* Lines */}
        <path d={buildPath(pidTemps)} fill="none" stroke="#ff4757" strokeWidth="2.2" strokeLinejoin="round" />
        <path d={buildPath(nfTemps)} fill="none" stroke="#2ed573" strokeWidth="2.4" strokeLinejoin="round" />

        {/* Hover marker */}
        {hoverIndex !== null && times[hoverIndex] !== undefined && (
          <g>
            <line
              x1={getX(times[hoverIndex])}
              y1={padding.top}
              x2={getX(times[hoverIndex])}
              y2={chartHeight - padding.bottom}
              stroke="rgba(255, 255, 255, 0.35)"
              strokeDasharray="3,3"
            />
            {/* PID dot */}
            <circle
              cx={getX(times[hoverIndex])}
              cy={getY(pidTemps[hoverIndex])}
              r="4.5"
              fill="#ff4757"
              stroke="#fff"
              strokeWidth="1.5"
            />
            {/* NF dot */}
            <circle
              cx={getX(times[hoverIndex])}
              cy={getY(nfTemps[hoverIndex])}
              r="4.5"
              fill="#2ed573"
              stroke="#fff"
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>
    </div>
  );
};

interface FanPowerChartProps {
  history: HistoryData;
  height?: number;
}

export const FanPowerChart: React.FC<FanPowerChartProps> = ({ history, height = 300 }) => {
  const times = history.time;
  const pidFans = history.pid_fan;
  const nfFans = history.nf_fan;
  const powers = history.power;

  if (!times || times.length === 0) return null;

  const minTime = times[0] ?? 0;
  const maxTime = times[times.length - 1] ?? 100;
  const timeSpan = Math.max(1, maxTime - minTime);

  const maxPower = Math.max(...powers, 500);

  const padding = { top: 25, right: 55, bottom: 35, left: 50 };
  const chartWidth = 900;
  const chartHeight = height;

  const getX = (t: number) => padding.left + ((t - minTime) / timeSpan) * (chartWidth - padding.left - padding.right);
  const getYFan = (f: number) => chartHeight - padding.bottom - (f / 100) * (chartHeight - padding.top - padding.bottom);
  const getYPower = (p: number) => chartHeight - padding.bottom - (p / maxPower) * (chartHeight - padding.top - padding.bottom);

  const buildFanPath = (data: number[]) => data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${getX(times[i])} ${getYFan(v)}`).join(' ');
  const buildPowerPath = (data: number[]) => data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${getX(times[i])} ${getYPower(v)}`).join(' ');

  return (
    <div className="rounded-2xl bg-[#0d0d22] border border-white/5 p-4 shadow-lg">
      <div className="flex items-center justify-between gap-4 mb-2 text-xs font-semibold">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[#ff4757]">
            <span className="w-3 h-1 bg-[#ff4757] rounded-full inline-block"></span>
            PID Fan Speed (%)
          </span>
          <span className="flex items-center gap-1.5 text-[#2ed573]">
            <span className="w-3 h-1 bg-[#2ed573] rounded-full inline-block"></span>
            NeuralFlow Fan Speed (%)
          </span>
          <span className="flex items-center gap-1.5 text-indigo-400">
            <span className="w-3 h-0.5 border-t border-dashed border-indigo-400 inline-block"></span>
            GPU Power Draw (W)
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto select-none">
        {/* Left Y Axis (Fan %) */}
        {[0, 25, 50, 75, 100].map(pct => (
          <g key={`pct-${pct}`}>
            <line x1={padding.left} y1={getYFan(pct)} x2={chartWidth - padding.right} y2={getYFan(pct)} stroke="rgba(100, 100, 220, 0.09)" />
            <text x={padding.left - 8} y={getYFan(pct) + 4} textAnchor="end" fill="#6a6a9a" fontSize="10" fontFamily="JetBrains Mono, monospace">
              {pct}%
            </text>
          </g>
        ))}

        {/* Right Y Axis (Power W) */}
        {Array.from(new Set([100, 300, 500, Math.round(maxPower)])).map((p, idx) => (
          <g key={`p-axis-${idx}-${p}`}>
            <text x={chartWidth - padding.right + 10} y={getYPower(p) + 4} textAnchor="start" fill="#818cf8" fontSize="10" fontFamily="JetBrains Mono, monospace">
              {p}W
            </text>
          </g>
        ))}

        {/* Curves */}
        <path d={buildPowerPath(powers)} fill="none" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.75" />
        <path d={buildFanPath(pidFans)} fill="none" stroke="#ff4757" strokeWidth="2" />
        <path d={buildFanPath(nfFans)} fill="none" stroke="#2ed573" strokeWidth="2.2" />
      </svg>
    </div>
  );
};
