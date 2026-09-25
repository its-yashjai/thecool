import { GPUThermalSimulator } from './simulator.js';
import { PIDController } from './pid.js';
import { NeuralFlowController } from './neuralflow.js';
import { LiveSimulationState, SimulationResult, HistoryData } from '../src/types.js';

export class SimulationEngine {
  HISTORY_LEN = 120;
  sim: GPUThermalSimulator;
  pid_ctrl: PIDController;
  nf_ctrl: NeuralFlowController;

  pid_T = 40.0;
  nf_T = 40.0;
  pid_fan = 30.0;
  nf_fan = 30.0;
  tick = 0;
  rolling_pw: number[] = [];
  running = false;

  ai_reqs = 10;
  api_reqs = 50;
  users = 20;
  batch = 0;

  /** Manual fan command from voice/UI, held for a number of ticks (otherwise the controller overwrote it next tick). */
  fan_override: { value: number; untilTick: number } | null = null;

  gpu_offsets: number[][];
  history: HistoryData;

  constructor() {
    this.sim = new GPUThermalSimulator();
    this.pid_ctrl = new PIDController(2.0, 0.1, 0.5, 70.0);
    this.nf_ctrl = new NeuralFlowController(80.0);

    // 3x3 GPU cluster random thermal dissipation offsets
    this.gpu_offsets = [
      [-1.8, 0.5, 2.3],
      [1.1, -0.7, -2.1],
      [0.4, 2.8, -1.2]
    ];

    this.history = {
      time: [],
      pid_temp: [],
      nf_temp: [],
      pid_fan: [],
      nf_fan: [],
      power: []
    };

    this.reset();
  }

  reset(): void {
    this.pid_T = 40.0;
    this.nf_T = 40.0;
    this.pid_fan = 30.0;
    this.nf_fan = 30.0;
    this.tick = 0;
    this.rolling_pw = [80.0];
    this.running = false;
    this.fan_override = null;
    this.pid_ctrl.reset();
    this.nf_ctrl.reset();

    this.history = {
      time: [],
      pid_temp: [],
      nf_temp: [],
      pid_fan: [],
      nf_fan: [],
      power: []
    };
  }

  /** Hold the NeuralFlow fan at `pct` for `holdTicks` ticks (default 40 ticks = 24s at 0.6s/tick). */
  setFanOverride(pct: number, holdTicks = 40): number {
    const value = Math.max(20, Math.min(100, Number.isFinite(pct) ? pct : 30));
    this.fan_override = { value, untilTick: this.tick + holdTicks };
    this.nf_fan = value;
    return value;
  }

  step(): LiveSimulationState {
    const power = this.sim.powerFromWorkload(
      this.ai_reqs,
      this.api_reqs,
      this.users,
      this.batch
    );

    this.rolling_pw.push(power);
    if (this.rolling_pw.length > 10) {
      this.rolling_pw.shift();
    }
    const rp = this.rolling_pw.reduce((a, b) => a + b, 0) / this.rolling_pw.length;

    // 1. PID step (reactive)
    this.pid_fan = this.pid_ctrl.step(this.pid_T, 1.0);
    this.pid_T = this.sim.stepDirect(this.pid_T, power, this.pid_fan, 1.0);

    // 2. NeuralFlow step (proactive PINN)
    const nf_state = [this.nf_T, power, this.nf_fan, this.sim.T_ambient, rp];
    let nfFan = this.nf_ctrl.step(nf_state);
    if (this.fan_override) {
      if (this.tick < this.fan_override.untilTick) {
        // Safety guardrail: when hot, a manual override may raise cooling but never lower it below the controller.
        nfFan = this.nf_T >= 80 ? Math.max(nfFan, this.fan_override.value) : this.fan_override.value;
      } else {
        this.fan_override = null;
      }
    }
    this.nf_fan = nfFan;
    this.nf_T = this.sim.stepDirect(this.nf_T, power, this.nf_fan, 1.0);

    // 3. Update history
    const h = this.history;
    h.time.push(this.tick);
    h.pid_temp.push(Number(this.pid_T.toFixed(2)));
    h.nf_temp.push(Number(this.nf_T.toFixed(2)));
    h.pid_fan.push(Number(this.pid_fan.toFixed(2)));
    h.nf_fan.push(Number(this.nf_fan.toFixed(2)));
    h.power.push(Number(power.toFixed(2)));

    if (h.time.length > this.HISTORY_LEN) {
      h.time.shift();
      h.pid_temp.shift();
      h.nf_temp.shift();
      h.pid_fan.shift();
      h.nf_fan.shift();
      h.power.shift();
    }

    this.tick += 1;

    // PINN forecast
    let forecast = null;
    if (this.nf_ctrl.window.length >= 25) {
      const pred = this.nf_ctrl.predictUncertainty();
      forecast = {
        worst: Number(pred.worstCase.toFixed(1)),
        mean: Number(pred.mean.toFixed(1)),
        unc: Number(pred.avgUnc.toFixed(1))
      };
    }

    // Build 3x3 cluster thermal grids
    const pid_grid = this.gpu_offsets.map(row =>
      row.map(offset => Math.min(95, Math.max(30, Number((this.pid_T + offset).toFixed(1)))))
    );
    const nf_grid = this.gpu_offsets.map(row =>
      row.map(offset => Math.min(95, Math.max(30, Number((this.nf_T + offset * 0.65).toFixed(1)))))
    );

    return {
      tick: this.tick,
      pid_T: Number(this.pid_T.toFixed(1)),
      nf_T: Number(this.nf_T.toFixed(1)),
      pid_fan: Number(this.pid_fan.toFixed(1)),
      nf_fan: Number(this.nf_fan.toFixed(1)),
      power: Number(power.toFixed(1)),
      history: { ...this.history },
      forecast,
      win_len: this.nf_ctrl.window.length,
      pid_grid,
      nf_grid,
      running: this.running,
      ai_reqs: this.ai_reqs,
      api_reqs: this.api_reqs,
      users: this.users,
      batch: this.batch
    };
  }

  fullSnapshot(): LiveSimulationState {
    const lastPower = this.rolling_pw[this.rolling_pw.length - 1] ?? 80.0;
    const pid_grid = this.gpu_offsets.map(row =>
      row.map(offset => Math.min(95, Math.max(30, Number((this.pid_T + offset).toFixed(1)))))
    );
    const nf_grid = this.gpu_offsets.map(row =>
      row.map(offset => Math.min(95, Math.max(30, Number((this.nf_T + offset * 0.65).toFixed(1)))))
    );

    let forecast = null;
    if (this.nf_ctrl.window.length >= 25) {
      const pred = this.nf_ctrl.predictUncertainty();
      forecast = {
        worst: Number(pred.worstCase.toFixed(1)),
        mean: Number(pred.mean.toFixed(1)),
        unc: Number(pred.avgUnc.toFixed(1))
      };
    }

    return {
      tick: this.tick,
      pid_T: Number(this.pid_T.toFixed(1)),
      nf_T: Number(this.nf_T.toFixed(1)),
      pid_fan: Number(this.pid_fan.toFixed(1)),
      nf_fan: Number(this.nf_fan.toFixed(1)),
      power: Number(lastPower.toFixed(1)),
      history: { ...this.history },
      forecast,
      win_len: this.nf_ctrl.window.length,
      pid_grid,
      nf_grid,
      running: this.running,
      ai_reqs: this.ai_reqs,
      api_reqs: this.api_reqs,
      users: this.users,
      batch: this.batch
    };
  }

  // Batch simulation for Evaluation / Analytics view
  static runBatch(pattern = 'mixed', duration = 600): SimulationResult {
    const sim = new GPUThermalSimulator();
    const pid = new PIDController(2.0, 0.1, 0.5, 70.0);
    const nf = new NeuralFlowController(80.0);

    let pid_T = sim.T_ambient + 15.0;
    let nf_T = sim.T_ambient + 15.0;
    let pid_fan = 30.0;
    let nf_fan = 30.0;

    const pid_powers_window: number[] = [];
    const nf_powers_window: number[] = [];

    const history: HistoryData = {
      time: [],
      pid_temp: [],
      nf_temp: [],
      pid_fan: [],
      nf_fan: [],
      power: []
    };

    let pid_throttle_count = 0;
    let nf_throttle_count = 0;
    let pid_energy_sum = 0;
    let nf_energy_sum = 0;

    // Mixed pattern: split any duration into three equal phases so 2, 5 and 10 minute runs all show
    // idle -> inference -> training burst (with fixed 100s phases a 2-minute run was almost all idle).
    const phaseLen = Math.max(20, Math.floor(duration / 3));
    for (let t = 0; t < duration; t++) {
      const P = sim.powerProfile(t, pattern, phaseLen);

      pid_powers_window.push(P);
      if (pid_powers_window.length > 10) pid_powers_window.shift();
      const pid_rp = pid_powers_window.reduce((a, b) => a + b, 0) / pid_powers_window.length;

      nf_powers_window.push(P);
      if (nf_powers_window.length > 10) nf_powers_window.shift();
      const nf_rp = nf_powers_window.reduce((a, b) => a + b, 0) / nf_powers_window.length;

      if (pid_T > 85.0) pid_throttle_count++;
      if (nf_T > 85.0) nf_throttle_count++;

      history.time.push(t);
      history.pid_temp.push(Number(pid_T.toFixed(2)));
      history.nf_temp.push(Number(nf_T.toFixed(2)));
      history.pid_fan.push(Number(pid_fan.toFixed(2)));
      history.nf_fan.push(Number(nf_fan.toFixed(2)));
      history.power.push(Number(P.toFixed(2)));

      // Step PID
      pid_fan = pid.step(pid_T, 1.0);
      pid_T = sim.stepDirect(pid_T, P, pid_fan, 1.0);

      // Step NeuralFlow
      const nf_state = [nf_T, P, nf_fan, sim.T_ambient, nf_rp];
      nf_fan = nf.step(nf_state);
      nf_T = sim.stepDirect(nf_T, P, nf_fan, 1.0);

      // Fan power consumption (0% = 0W, 100% = 300W)
      pid_energy_sum += (pid_fan * 3.0) / 3600.0;
      nf_energy_sum += (nf_fan * 3.0) / 3600.0;
    }

    const calcStats = (arr: number[]) => {
      const max = Math.max(...arr);
      const min = Math.min(...arr);
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const variance = arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / arr.length;
      return { max, min, mean, std: Math.sqrt(variance) };
    };

    const pidStats = calcStats(history.pid_temp);
    const nfStats = calcStats(history.nf_temp);

    const energySavedPct = (1.0 - nf_energy_sum / Math.max(pid_energy_sum, 0.001)) * 100.0;

    return {
      pid: {
        peak_temp: Number(pidStats.max.toFixed(1)),
        mean_temp: Number(pidStats.mean.toFixed(1)),
        temp_std: Number(pidStats.std.toFixed(1)),
        cooling_energy_wh: Number(pid_energy_sum.toFixed(1)),
        throttle_events: pid_throttle_count,
        min_temp: Number(pidStats.min.toFixed(1))
      },
      neuralflow: {
        peak_temp: Number(nfStats.max.toFixed(1)),
        mean_temp: Number(nfStats.mean.toFixed(1)),
        temp_std: Number(nfStats.std.toFixed(1)),
        cooling_energy_wh: Number(nf_energy_sum.toFixed(1)),
        throttle_events: nf_throttle_count,
        min_temp: Number(nfStats.min.toFixed(1))
      },
      energy_saved_pct: Number(energySavedPct.toFixed(1)),
      pattern,
      duration,
      history
    };
  }
}
