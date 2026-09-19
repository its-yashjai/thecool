// PID Controller — Baseline reactive cooling controller
export class PIDController {
  Kp: number;
  Ki: number;
  Kd: number;
  setpoint: number;
  integral: number;
  prev_error: number;

  constructor(Kp = 2.0, Ki = 0.1, Kd = 0.5, setpoint = 70.0) {
    this.Kp = Kp;
    this.Ki = Ki;
    this.Kd = Kd;
    this.setpoint = setpoint;
    this.integral = 0.0;
    this.prev_error = 0.0;
  }

  reset(): void {
    this.integral = 0.0;
    this.prev_error = 0.0;
  }

  step(current_temp: number, dt = 1.0): number {
    const error = current_temp - this.setpoint;
    this.integral += error * dt;
    // Anti-windup: clamp integral term
    this.integral = Math.max(-200, Math.min(200, this.integral));
    const derivative = (error - this.prev_error) / dt;
    const output = this.Kp * error + this.Ki * this.integral + this.Kd * derivative;
    this.prev_error = error;
    return Math.max(0, Math.min(100, output));
  }
}
