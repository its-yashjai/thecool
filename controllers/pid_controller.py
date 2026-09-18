"""
PID Controller — Baseline reactive cooling controller.
Reacts to current temperature only, with integral wind-up and derivative smoothing.
"""


class PIDController:
    def __init__(self, Kp=2.0, Ki=0.1, Kd=0.5, setpoint=75.0):
        self.Kp = Kp
        self.Ki = Ki
        self.Kd = Kd
        self.setpoint = setpoint
        self.integral = 0.0
        self.prev_error = 0.0

    def reset(self):
        self.integral = 0.0
        self.prev_error = 0.0

    def step(self, current_temp, dt=1):
        error = current_temp - self.setpoint
        self.integral += error * dt
        # Anti-windup: clamp integral term
        self.integral = max(-200, min(200, self.integral))
        derivative = (error - self.prev_error) / dt
        output = self.Kp * error + self.Ki * self.integral + self.Kd * derivative
        self.prev_error = error
        return max(0, min(100, output))
