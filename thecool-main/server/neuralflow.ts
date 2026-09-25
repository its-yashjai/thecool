// NeuralFlow Controller — Proactive Physics-Informed Cooling Controller
export class NeuralFlowController {
  threshold: number;
  window: number[][];
  maxWindow = 30;
  /** Thermal model the forecaster integrates; must match the plant (simulator) it controls. */
  C: number;
  k: number;

  constructor(threshold = 80.0, C = 500.0, k = 0.022) {
    this.threshold = threshold;
    this.C = C;
    this.k = k;
    this.window = [];
  }

  /** Last fan command, for smooth ramp-down (no chatter). */
  lastFan = 20;

  reset(): void {
    this.window = [];
    this.lastFan = 20;
  }

  /** Forecast the next 30/45/60 s. `fanPct` = the fan to assume (default: the last one applied). */
  predictUncertainty(fanPct?: number): {
    forecasts: [number, number, number];
    uncertainties: [number, number, number];
    worstCase: number;
    mean: number;
    avgUnc: number;
  } {
    if (this.window.length === 0) {
      return { forecasts: [40, 40, 40], uncertainties: [1.5, 1.8, 2.1], worstCase: 42, mean: 40, avgUnc: 1.8 };
    }

    const latest = this.window[this.window.length - 1];
    const [T_now, power_now, fan_now, T_amb, rolling_power] = latest;

    // Estimate recent power trend
    const recentPowers = this.window.slice(-10).map(w => w[1]);
    const powerMean = recentPowers.reduce((a, b) => a + b, 0) / recentPowers.length;
    const powerVar = recentPowers.reduce((acc, p) => acc + Math.pow(p - powerMean, 2), 0) / recentPowers.length;
    const powerStd = Math.sqrt(powerVar);

    // Physics ODE forward projection with heat capacity C=500, k=0.05
    const C = this.C;
    const k = this.k;
    const effectiveFan = Math.max(fanPct ?? fan_now, 20.0);
    const k_eff = k * (0.5 + effectiveFan / 100.0);

    // Dynamic temperature integration over 30s, 45s, 60s
    const projectT = (seconds: number, projectedPower: number) => {
      // Analytical solution to dT/dt = P/C - k_eff*(T - T_amb)
      // T(t) = T_amb + P/(C*k_eff) + (T_0 - T_amb - P/(C*k_eff)) * exp(-k_eff * t)
      const T_inf = T_amb + projectedPower / (C * k_eff);
      const expTerm = Math.exp(-k_eff * seconds);
      return T_inf + (T_now - T_inf) * expTerm;
    };

    const powerPessimistic = powerMean + 0.6 * powerStd;
    const t30 = projectT(30, powerPessimistic);
    const t45 = projectT(45, powerPessimistic * 1.05);
    const t60 = projectT(60, powerPessimistic * 1.08);

    // MC Dropout uncertainty approximation: increases with prediction horizon & power volatility
    const unc30 = Math.max(1.2, 1.0 + (powerStd / 80.0));
    const unc45 = Math.max(1.6, 1.4 + (powerStd / 70.0));
    const unc60 = Math.max(2.0, 1.8 + (powerStd / 60.0));

    const forecasts: [number, number, number] = [t30, t45, t60];
    const uncertainties: [number, number, number] = [unc30, unc45, unc60];

    const worstCase = Math.max(t30 + unc30, t45 + unc45, t60 + unc60);
    const mean = (t30 + t45 + t60) / 3.0;
    const avgUnc = (unc30 + unc45 + unc60) / 3.0;

    return { forecasts, uncertainties, worstCase, mean, avgUnc };
  }

  step(currentState: number[]): number {
    this.window.push(currentState);
    if (this.window.length > this.maxWindow) {
      this.window.shift();
    }

    const temp = currentState[0];

    if (this.window.length < this.maxWindow) {
      // Warm-up period before 30 samples: reactive safe baseline
      if (temp > 75) {
        return Math.min(100, Math.max(20, (temp - 70) * 8));
      }
      return 20.0;
    }

    // Predictive control: forecast the next 60 s under each candidate fan speed and choose the LOWEST
    // speed whose worst case (forecast + uncertainty) stays under the threshold. The old rule forecast
    // with last second's fan, so it flipped between ~55% and 95% every tick.
    let fanSpeed = 100;
    for (let f = 20; f <= 100; f += 5) {
      if (this.predictUncertainty(f).worstCase <= this.threshold) {
        fanSpeed = f;
        break;
      }
    }
    // Ramp up immediately (safety), ramp down at most 5%/s (no chatter, no acoustic pumping)
    if (fanSpeed < this.lastFan) fanSpeed = Math.max(fanSpeed, this.lastFan - 5);
    fanSpeed = Math.max(20, Math.min(100, fanSpeed));
    this.lastFan = fanSpeed;
    return fanSpeed;
  }
}
