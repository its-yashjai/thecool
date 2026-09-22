/**
 * Live Telemetry History — rolling in-memory buffer for recent simulator telemetry.
 * Uses authoritative SimulationEngine state (LiveSimulationState), not a duplicate engine.
 * Bounded to ~10 minutes at 600ms tick = 1000 snapshots max.
 */

import { LiveSimulationState } from '../src/types.js';

export interface TelemetrySnapshot {
  timestamp: number; // epoch ms
  tick: number;
  // core live state
  nf_T: number;
  pid_T: number;
  nf_fan: number;
  pid_fan: number;
  power: number;
  ai_reqs: number;
  api_reqs: number;
  users: number;
  batch: number;
  running: boolean;
  forecastWorst?: number | null;
  forecastMean?: number | null;
  // derived
  throttle: boolean; // nf_T > 85
  // per-GPU grid for GPU-04 tracking (center cell)
  gpu04_T?: number;
}

export interface HistoryWindow {
  windowMs: number;
  sampleCount: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  snapshots: TelemetrySnapshot[];
}

export interface HistorySummary {
  windowMs: number;
  sampleCount: number;
  durationSec: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  current: TelemetrySnapshot | null;
  oldest: TelemetrySnapshot | null;
  peak: { nf_T: number; pid_T: number; tick: number; timestamp: number } | null;
  delta: {
    nf_T: number; // newest - oldest
    pid_T: number;
    nf_fan: number;
    power: number;
    ai_reqs: number;
  } | null;
  throttleEvents: number;
  avg: { nf_T: number; power: number; nf_fan: number } | null;
  gpu04?: { start: number; end: number; delta: number } | null;
}

export class TelemetryHistory {
  private buffer: TelemetrySnapshot[] = [];
  private maxSamples: number;
  private intervalMs: number;

  constructor(opts?: { maxMinutes?: number; tickIntervalMs?: number }) {
    const minutes = opts?.maxMinutes ?? 10;
    const tickMs = opts?.tickIntervalMs ?? 600;
    this.intervalMs = tickMs;
    // 10 min / 0.6s = 1000
    this.maxSamples = Math.ceil((minutes * 60 * 1000) / tickMs);
  }

  private toSnapshot(state: LiveSimulationState): TelemetrySnapshot {
    const now = Date.now();
    const gpu04 = state.nf_grid?.[1]?.[1] ?? state.nf_T;
    return {
      timestamp: now,
      tick: state.tick,
      nf_T: state.nf_T,
      pid_T: state.pid_T,
      nf_fan: state.nf_fan,
      pid_fan: state.pid_fan,
      power: state.power,
      ai_reqs: state.ai_reqs,
      api_reqs: state.api_reqs,
      users: state.users,
      batch: state.batch,
      running: state.running,
      forecastWorst: state.forecast?.worst ?? null,
      forecastMean: state.forecast?.mean ?? null,
      throttle: state.nf_T > 85,
      gpu04_T: gpu04,
    };
  }

  push(state: LiveSimulationState): void {
    const snap = this.toSnapshot(state);
    this.buffer.push(snap);
    if (this.buffer.length > this.maxSamples) this.buffer.shift();
  }

  // Called on control changes even when not ticking (e.g., reset)
  pushNow(state: LiveSimulationState): void {
    this.push(state);
  }

  getWindow(windowMs: number): HistoryWindow {
    const now = Date.now();
    const cutoff = now - windowMs;
    const snaps = this.buffer.filter(s => s.timestamp >= cutoff);
    return {
      windowMs,
      sampleCount: snaps.length,
      oldestTimestamp: snaps[0]?.timestamp ?? null,
      newestTimestamp: snaps[snaps.length - 1]?.timestamp ?? null,
      snapshots: snaps,
    };
  }

  getSummary(windowMs: number): HistorySummary | null {
    const win = this.getWindow(windowMs);
    if (win.sampleCount === 0) return null;
    const snaps = win.snapshots;
    const oldest = snaps[0];
    const current = snaps[snaps.length - 1];
    const durationSec = (current.timestamp - oldest.timestamp) / 1000;
    let peakNf = oldest, peakPid = oldest;
    let throttleEvents = 0;
    let sumNf = 0, sumPower = 0, sumFan = 0;
    for (const s of snaps) {
      if (s.nf_T > peakNf.nf_T) peakNf = s;
      if (s.pid_T > peakPid.pid_T) peakPid = s;
      if (s.throttle) throttleEvents++;
      sumNf += s.nf_T;
      sumPower += s.power;
      sumFan += s.nf_fan;
    }
    const peak = {
      nf_T: peakNf.nf_T,
      pid_T: peakPid.pid_T,
      tick: peakNf.tick,
      timestamp: peakNf.timestamp,
    };
    return {
      windowMs,
      sampleCount: win.sampleCount,
      durationSec: Math.round(durationSec * 10) / 10,
      oldestTimestamp: win.oldestTimestamp,
      newestTimestamp: win.newestTimestamp,
      current,
      oldest,
      peak,
      delta: {
        nf_T: Math.round((current.nf_T - oldest.nf_T) * 10) / 10,
        pid_T: Math.round((current.pid_T - oldest.pid_T) * 10) / 10,
        nf_fan: Math.round((current.nf_fan - oldest.nf_fan) * 10) / 10,
        power: Math.round((current.power - oldest.power) * 10) / 10,
        ai_reqs: current.ai_reqs - oldest.ai_reqs,
      },
      throttleEvents,
      avg: {
        nf_T: Math.round((sumNf / snaps.length) * 10) / 10,
        power: Math.round((sumPower / snaps.length) * 10) / 10,
        nf_fan: Math.round((sumFan / snaps.length) * 10) / 10,
      },
      gpu04: oldest.gpu04_T !== undefined && current.gpu04_T !== undefined ? {
        start: oldest.gpu04_T!,
        end: current.gpu04_T!,
        delta: Math.round((current.gpu04_T! - oldest.gpu04_T!) * 10) / 10,
      } : undefined,
    };
  }

  describeHistory(windowMs: number): string {
    const summary = this.getSummary(windowMs);
    if (!summary || !summary.current || !summary.oldest) {
      return `No live history yet (0 samples in last ${Math.round(windowMs/60000)}m). Simulation may be paused or just started.`;
    }
    const mins = Math.round(windowMs / 60000);
    const parts: string[] = [];
    parts.push(`Last ${mins} min • ${summary.sampleCount} samples • ${summary.durationSec}s span`);
    parts.push(`GPU junction: ${summary.oldest.nf_T.toFixed(1)}°C → ${summary.current.nf_T.toFixed(1)}°C (Δ ${summary.delta!.nf_T >=0 ? '+' : ''}${summary.delta!.nf_T}°C)`);
    if (summary.gpu04) parts.push(`GPU-04: ${summary.gpu04.start.toFixed(1)}°C → ${summary.gpu04.end.toFixed(1)}°C (Δ ${summary.gpu04.delta >=0 ? '+' : ''}${summary.gpu04.delta}°C)`);
    parts.push(`Fan: ${summary.oldest.nf_fan.toFixed(0)}% → ${summary.current.nf_fan.toFixed(0)}% (Δ ${summary.delta!.nf_fan >=0 ? '+' : ''}${summary.delta!.nf_fan.toFixed(0)}%)`);
    parts.push(`Workload: ${summary.oldest.ai_reqs} → ${summary.current.ai_reqs} req/s (Δ ${summary.delta!.ai_reqs >=0 ? '+' : ''}${summary.delta!.ai_reqs})`);
    parts.push(`Power: ${summary.oldest.power.toFixed(0)}W → ${summary.current.power.toFixed(0)}W (Δ ${summary.delta!.power >=0 ? '+' : ''}${summary.delta!.power.toFixed(0)}W)`);
    if (summary.peak) parts.push(`Peak NF: ${summary.peak.nf_T.toFixed(1)}°C (tick ${summary.peak.tick})`);
    if (summary.throttleEvents > 0) parts.push(`Throttle events: ${summary.throttleEvents}`);
    else parts.push(`Throttle events: 0`);
    if (summary.current.forecastWorst != null) parts.push(`Forecast worst: ${summary.current.forecastWorst.toFixed(1)}°C`);
    parts.push(`Running: ${summary.current.running ? 'yes' : 'paused'}`);
    return parts.join(' | ');
  }

  // Helpers for specific questions
  getPeak(windowMs: number): { nf_T: number; timestamp: number } | null {
    const s = this.getSummary(windowMs);
    return s?.peak ? { nf_T: s.peak.nf_T, timestamp: s.peak.timestamp } : null;
  }

  getTrend(windowMs: number): { nfDelta: number; workloadDelta: number; fanDelta: number } | null {
    const s = this.getSummary(windowMs);
    if (!s?.delta) return null;
    return { nfDelta: s.delta.nf_T, workloadDelta: s.delta.ai_reqs, fanDelta: s.delta.nf_fan };
  }

  didWorkloadIncreaseBeforeTemp(windowMs: number): boolean | null {
    const win = this.getWindow(windowMs);
    if (win.sampleCount < 3) return null;
    // Find first workload increase vs first temp increase
    const snaps = win.snapshots;
    let workloadIdx: number | null = null;
    let tempIdx: number | null = null;
    for (let i = 1; i < snaps.length; i++) {
      if (workloadIdx === null && snaps[i].ai_reqs > snaps[i-1].ai_reqs + 5) workloadIdx = i;
      if (tempIdx === null && snaps[i].nf_T > snaps[i-1].nf_T + 0.3) tempIdx = i;
      if (workloadIdx !== null && tempIdx !== null) break;
    }
    if (workloadIdx === null || tempIdx === null) return null;
    return workloadIdx < tempIdx;
  }

  timeSinceHeating(windowMs: number, thresholdDelta = 1.0): number | null {
    const s = this.getSummary(windowMs);
    if (!s) return null;
    // Approximate: if delta > threshold, assume heating started near oldest
    if (s.delta && s.delta.nf_T > thresholdDelta) {
      return Math.round((s.newestTimestamp! - s.oldestTimestamp!) / 1000);
    }
    return null;
  }

  getStats() {
    return {
      totalSamples: this.buffer.length,
      maxSamples: this.maxSamples,
      oldestTimestamp: this.buffer[0]?.timestamp ?? null,
      newestTimestamp: this.buffer[this.buffer.length - 1]?.timestamp ?? null,
      windowMs: this.maxSamples * this.intervalMs,
    };
  }

  // For API: summary for default 5m
  summaryForApi(windowMs = 5 * 60 * 1000) {
    const win = this.getWindow(windowMs);
    const summary = this.getSummary(windowMs);
    const current = this.buffer[this.buffer.length - 1] ?? null;
    return {
      windowMs,
      sampleCount: win.sampleCount,
      oldestTimestamp: win.oldestTimestamp,
      newestTimestamp: win.newestTimestamp,
      current,
      summary,
      totalSamples: this.buffer.length,
      maxSamples: this.maxSamples,
    };
  }
}
