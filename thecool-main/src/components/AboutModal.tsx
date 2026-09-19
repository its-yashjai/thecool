import React from 'react';
import {
  X,
  User,
  Mail,
  GitBranch,
  Award,
  BookOpen,
  Cpu,
  CheckCircle2,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div
        id="about-author-modal"
        className="relative w-full max-w-2xl rounded-2xl bg-[#0e0e28] border border-[#2ed573]/30 p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-zinc-200"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Author Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#2ed573] to-[#1e90ff] p-0.5 shadow-[0_0_20px_rgba(46,213,115,0.4)] flex-shrink-0">
            <div className="w-full h-full bg-[#0d0d24] rounded-[14px] flex items-center justify-center">
              <User className="w-7 h-7 text-[#2ed573]" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white tracking-tight">Yash Jai</h2>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-[#2ed573]/20 text-[#2ed573] border border-[#2ed573]/30">
                Author &amp; Lead Researcher
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Creator of <strong>NeuralFlow</strong> &bull; Physics-Informed Neural Network Architecture for Proactive GPU Cooling
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs font-mono">
              <a
                href="mailto:yashjaimail@gmail.com"
                className="flex items-center gap-1.5 text-zinc-300 hover:text-[#2ed573] transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-[#2ed573]" />
                yashjaimail@gmail.com
              </a>
              <a
                href="https://github.com/its-yashjai/thecool"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-zinc-300 hover:text-[#2ed573] transition-colors"
              >
                <GitBranch className="w-3.5 h-3.5 text-sky-400" />
                github.com/its-yashjai/thecool
                <ExternalLink className="w-3 h-3 text-zinc-500" />
              </a>
            </div>
          </div>
        </div>

        {/* Project Highlights */}
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#141434] border border-white/5 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" /> Research Motivation &amp; Innovation
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Modern AI clusters running LLM training and dense inference generate extreme thermal shocks. Traditional PID controllers react only <em>after</em> junction temperature spikes. Yash Jai developed <strong>NeuralFlow</strong> to replace reactive control with a <strong>Physics-Informed Neural Network (PINN)</strong> that anticipates heat spikes 30–60 seconds ahead using Newton's Law of Cooling, eliminating thermal throttling entirely and reducing cooling energy consumption by ~12.8%.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#121230] border border-white/5 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" /> Zero Throttling Guarantee
              </div>
              <p className="text-[11px] text-zinc-400">
                Maintains peak temperatures well below the critical 85°C thermal throttle limit under bursty workloads.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#121230] border border-white/5 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 font-mono">
                <ShieldCheck className="w-3.5 h-3.5" /> LEAP 71 Noyron Architecture
              </div>
              <p className="text-[11px] text-zinc-400">
                Directly incorporates physical governing differential equations into the predictive control horizon.
              </p>
            </div>
          </div>

          {/* Technical Specs */}
          <div className="p-3 rounded-xl bg-[#090918] border border-white/5 flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400">Digital Twin Engine</span>
            <span className="text-white font-semibold">Node.js 22 &bull; TypeScript &bull; RK4 Thermal Integrator</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 pt-4 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-[#2ed573] hover:bg-[#27bf66] text-black transition-all cursor-pointer"
          >
            Close Overview
          </button>
        </div>
      </div>
    </div>
  );
};
