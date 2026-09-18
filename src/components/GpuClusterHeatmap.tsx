import React from 'react';
import { Server, Flame, ShieldAlert, Cpu } from 'lucide-react';

interface GpuClusterHeatmapProps {
  pidGrid: number[][];
  nfGrid: number[][];
}

export const GpuClusterHeatmap: React.FC<GpuClusterHeatmapProps> = ({ pidGrid, nfGrid }) => {
  const getTempColor = (temp: number) => {
    if (temp >= 85) return 'bg-red-500/30 border-red-500 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.35)]';
    if (temp >= 75) return 'bg-amber-500/20 border-amber-500/80 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]';
    if (temp >= 65) return 'bg-sky-500/20 border-sky-500/60 text-sky-200';
    if (temp >= 50) return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200';
    return 'bg-blue-500/15 border-blue-500/40 text-blue-200';
  };

  const getHeatmapColorBar = (temp: number) => {
    if (temp >= 85) return 'bg-red-500';
    if (temp >= 75) return 'bg-amber-500';
    if (temp >= 65) return 'bg-sky-500';
    if (temp >= 50) return 'bg-emerald-500';
    return 'bg-blue-500';
  };

  const calculateAverage = (grid: number[][]) => {
    const flat = grid.flat();
    return flat.length ? flat.reduce((a, b) => a + b, 0) / flat.length : 0;
  };

  const pidAvg = calculateAverage(pidGrid);
  const nfAvg = calculateAverage(nfGrid);
  const pidMax = Math.max(...pidGrid.flat(), 0);
  const nfMax = Math.max(...nfGrid.flat(), 0);

  return (
    <div id="gpu-cluster-heatmaps" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* PID Cluster (Reactive) */}
      <div className="rounded-2xl bg-[#0e0e28] border border-red-500/20 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center border border-red-500/30">
              <Flame className="w-4 h-4 text-[#ff4757]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-wide">PID Cluster (Reactive Baseline)</h4>
              <p className="text-[11px] text-zinc-400">Rack Node 1: Uncoordinated cooling</p>
            </div>
          </div>
          <div className="text-right font-mono text-xs">
            <div className="text-zinc-400">Avg: <span className="text-white font-semibold">{pidAvg.toFixed(1)}°C</span></div>
            <div className="text-zinc-400">Max: <span className={pidMax >= 85 ? 'text-red-400 font-bold' : 'text-zinc-300'}>{pidMax.toFixed(1)}°C</span></div>
          </div>
        </div>

        {/* 3x3 Grid */}
        <div className="grid grid-cols-3 gap-3">
          {pidGrid.flatMap((row, r) =>
            row.map((temp, c) => {
              const gpuIndex = r * 3 + c;
              const isThrottled = temp >= 85;
              return (
                <div
                  key={`pid-gpu-${gpuIndex}`}
                  className={`relative p-3.5 rounded-xl border transition-all duration-300 flex flex-col justify-between h-24 ${getTempColor(temp)}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono tracking-widest text-zinc-400">GPU {gpuIndex}</span>
                    {isThrottled ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500 text-white animate-pulse flex items-center gap-0.5">
                        <ShieldAlert className="w-2.5 h-2.5" /> THROTTLE
                      </span>
                    ) : (
                      <Cpu className="w-3 h-3 text-zinc-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-xl font-black tracking-tight font-mono">
                      {temp.toFixed(1)}°C
                    </div>
                    <div className="w-full h-1 bg-black/40 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className={`h-full ${getHeatmapColorBar(temp)} transition-all duration-500`}
                        style={{ width: `${Math.min(100, Math.max(10, ((temp - 30) / 65) * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* NeuralFlow Cluster (Proactive PINN) */}
      <div className="rounded-2xl bg-[#0e0e28] border border-[#2ed573]/30 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2ed573]/15 flex items-center justify-center border border-[#2ed573]/30">
              <Server className="w-4 h-4 text-[#2ed573]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-wide">NeuralFlow Cluster (Proactive PINN)</h4>
              <p className="text-[11px] text-zinc-400">Rack Node 2: Proactive fan pre-ramping</p>
            </div>
          </div>
          <div className="text-right font-mono text-xs">
            <div className="text-zinc-400">Avg: <span className="text-emerald-400 font-semibold">{nfAvg.toFixed(1)}°C</span></div>
            <div className="text-zinc-400">Max: <span className="text-emerald-300 font-semibold">{nfMax.toFixed(1)}°C</span></div>
          </div>
        </div>

        {/* 3x3 Grid */}
        <div className="grid grid-cols-3 gap-3">
          {nfGrid.flatMap((row, r) =>
            row.map((temp, c) => {
              const gpuIndex = r * 3 + c;
              return (
                <div
                  key={`nf-gpu-${gpuIndex}`}
                  className={`relative p-3.5 rounded-xl border transition-all duration-300 flex flex-col justify-between h-24 ${getTempColor(temp)}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono tracking-widest text-zinc-400">GPU {gpuIndex}</span>
                    <span className="text-[9px] font-bold text-[#2ed573] bg-[#2ed573]/15 px-1.5 py-0.5 rounded">
                      STABLE
                    </span>
                  </div>
                  <div>
                    <div className="text-xl font-black tracking-tight font-mono text-[#2ed573]">
                      {temp.toFixed(1)}°C
                    </div>
                    <div className="w-full h-1 bg-black/40 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className={`h-full ${getHeatmapColorBar(temp)} transition-all duration-500`}
                        style={{ width: `${Math.min(100, Math.max(10, ((temp - 30) / 65) * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
