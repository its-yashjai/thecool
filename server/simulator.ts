// GPU Thermal Simulator - Port of simulator.py
export class GPUThermalSimulator {
  C: number;
  k: number;
  T_ambient: number;

  constructor(C_thermal = 500, k = 0.05, T_ambient = 25.0) {
    this.C = C_thermal;
    this.k = k;
    this.T_ambient = T_ambient;
  }

  // Gaussian noise helper (Box-Muller transform)
  private gaussianRandom(mean = 0, stdDev = 1): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return num * stdDev + mean;
  }

  powerProfile(t: number, pattern: string): number {
    if (pattern === 'idle') {
      return 90 + 10 * Math.sin(t * 0.1) + this.gaussianRandom(0, 2);
    } else if (pattern === 'inference') {
      const base = 250 + 20 * Math.sin(t * 0.05);
      const spike = Math.random() > 0.8 ? 80 : 0;
      return base + spike + this.gaussianRandom(0, 5);
    } else if (pattern === 'training_burst') {
      if (t < 20) {
        return 400 + 15 * t + this.gaussianRandom(0, 5);
      } else {
        return 650 + 50 * Math.sin(t * 0.2) + this.gaussianRandom(0, 10);
      }
    } else if (pattern === 'mixed') {
      const cycle = Math.floor(t / 100) % 3;
      if (cycle === 0) return this.powerProfile(t, 'idle');
      if (cycle === 1) return this.powerProfile(t, 'inference');
      return this.powerProfile(t, 'training_burst');
    } else {
      return 100;
    }
  }

  powerFromWorkload(
    ai_reqs = 0,
    api_reqs = 0,
    user_sessions = 0,
    batch_jobs = 0
  ): number {
    // Strictly clamp inputs to user-defined maximum limits
    const safe_ai = Math.max(0, Math.min(100, ai_reqs));
    const safe_api = Math.max(0, Math.min(500, api_reqs));
    const safe_users = Math.max(0, Math.min(200, user_sessions));
    const safe_batch = Math.max(0, Math.min(5, batch_jobs));

    const base_idle = 80.0;
    const ai_power = safe_ai * 3.0; // 0 to 300W
    const api_power = safe_api * 0.3; // 0 to 150W
    const user_power = safe_users * 0.5; // 0 to 100W
    const batch_power = safe_batch * 100.0; // 0 to 500W
    const total = base_idle + ai_power + api_power + user_power + batch_power;
    const noise = this.gaussianRandom(0, Math.max(total * 0.015, 0.5));
    return Math.max(80.0, Math.min(1135.0, total + noise));
  }

  // Exact Runge-Kutta 4th order (RK4) integration for 1 second step
  stepDirect(T_current: number, power_draw: number, fan_speed: number, dt = 1.0): number {
    const k_effective = this.k * (0.5 + fan_speed / 100.0);
    const computeDerivative = (T: number) => {
      return (power_draw / this.C) - k_effective * (T - this.T_ambient);
    };

    const k1 = computeDerivative(T_current);
    const k2 = computeDerivative(T_current + 0.5 * dt * k1);
    const k3 = computeDerivative(T_current + 0.5 * dt * k2);
    const k4 = computeDerivative(T_current + dt * k3);

    return T_current + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
  }
}
