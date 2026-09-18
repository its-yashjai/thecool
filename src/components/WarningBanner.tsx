import React from 'react';
import { AlertTriangle, AlertOctagon, Info, X, Zap, Volume2, ShieldAlert } from 'lucide-react';
import { useGlobalVoice } from '../context/VoiceContext';
import { ClusterWarning } from '../types';

export const WarningBanner: React.FC = () => {
  const { activeWarnings, dismissWarning, triggerMitigation } = useGlobalVoice();

  if (activeWarnings.length === 0) return null;

  return (
    <div id="cluster-warnings-container" className="space-y-2 mb-6">
      {activeWarnings.map((warning: ClusterWarning) => {
        const isCritical = warning.level === 'critical';
        const isWarning = warning.level === 'warning';

        const bgClass = isCritical
          ? 'bg-gradient-to-r from-red-950/80 via-[#2d0a0a]/90 to-red-950/80 border-red-500/60 shadow-[0_0_25px_rgba(239,68,68,0.25)]'
          : isWarning
          ? 'bg-gradient-to-r from-amber-950/70 via-[#2d1b06]/80 to-amber-950/70 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
          : 'bg-gradient-to-r from-sky-950/60 via-[#071d2e]/70 to-sky-950/60 border-sky-500/40 shadow-[0_0_15px_rgba(14,165,233,0.15)]';

        const iconColor = isCritical
          ? 'text-red-400 animate-pulse'
          : isWarning
          ? 'text-amber-400'
          : 'text-sky-400';

        const badgeClass = isCritical
          ? 'bg-red-500/20 text-red-300 border-red-500/40'
          : isWarning
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          : 'bg-sky-500/20 text-sky-300 border-sky-500/40';

        return (
          <div
            key={warning.id}
            id={`warning-${warning.id}`}
            className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-2 ${bgClass}`}
          >
            <div className="flex items-start sm:items-center gap-3">
              <div className={`p-2 rounded-xl bg-black/40 flex-shrink-0 ${iconColor}`}>
                {isCritical ? (
                  <AlertOctagon className="w-5 h-5" />
                ) : isWarning ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <Info className="w-5 h-5" />
                )}
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${badgeClass}`}>
                    {warning.level.toUpperCase()} ALERT
                  </span>
                  <h4 className="text-xs sm:text-sm font-bold text-white tracking-wide">
                    {warning.title}
                  </h4>
                  {warning.value && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/50 text-zinc-300 border border-white/10">
                      {warning.metric}: <strong className="text-white">{warning.value}</strong>
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-zinc-400">{warning.timestamp}</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans max-w-4xl">
                  {warning.message}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
              {warning.actionText && (
                <button
                  id={`mitigate-btn-${warning.id}`}
                  onClick={() => triggerMitigation(warning.actionCmd || 'play', warning.actionParams)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5 shadow-md ${
                    isCritical
                      ? 'bg-red-500 hover:bg-red-400 text-white'
                      : isWarning
                      ? 'bg-amber-400 hover:bg-amber-300 text-black'
                      : 'bg-sky-500 hover:bg-sky-400 text-black'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>{warning.actionText}</span>
                </button>
              )}

              <button
                id={`dismiss-warning-${warning.id}`}
                onClick={() => dismissWarning(warning.id)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Dismiss warning"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
