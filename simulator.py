import numpy as np
import math

class GPUThermalSimulator:
    def __init__(self, C_thermal=500, k=0.05, T_ambient=25.0):
        self.C = C_thermal
        self.k = k
        self.T_ambient = T_ambient

    def power_profile(self, t, pattern):
        if pattern == 'idle':
            # 80 - 100 W
            return 90 + 10 * math.sin(t * 0.1) + np.random.normal(0, 2)
        elif pattern == 'inference':
            # 200 - 350 W
            # Occasional spikes
            base = 250 + 20 * math.sin(t * 0.05)
            spike = 80 if np.random.rand() > 0.8 else 0
            return base + spike + np.random.normal(0, 5)
        elif pattern == 'training_burst':
            # 400 - 700 W
            # Sharp spike then sustained
            if t < 20:
                return 400 + 15 * t + np.random.normal(0, 5)
            else:
                return 650 + 50 * math.sin(t * 0.2) + np.random.normal(0, 10)
        elif pattern == 'mixed':
            # Alternating jobs
            cycle = (t // 100) % 3
            if cycle == 0:
                return self.power_profile(t, 'idle')
            elif cycle == 1:
                return self.power_profile(t, 'inference')
            else:
                return self.power_profile(t, 'training_burst')
        else:
            return 100

    def power_from_workload(self, ai_reqs=0, api_reqs=0, user_sessions=0, batch_jobs=0):
        """
        Map user-facing workload parameters into GPU power draw (Watts).
        
        Parameters:
            ai_reqs:       AI inference requests/s   (0-100)  ~3W each
            api_reqs:      API requests/s            (0-500)  ~0.3W each
            user_sessions: Active user sessions      (0-200)  ~0.5W each
            batch_jobs:    Batch training jobs        (0-5)    ~100W each
        
        Returns: total GPU power in Watts + noise
        """
        base_idle = 80.0
        ai_power = ai_reqs * 3.0
        api_power = api_reqs * 0.3
        user_power = user_sessions * 0.5
        batch_power = batch_jobs * 100.0
        total = base_idle + ai_power + api_power + user_power + batch_power
        # Add realistic noise (2% of total)
        noise = np.random.normal(0, max(total * 0.02, 1.0))
        return max(80.0, total + noise)

    def step(self, t, T, fan_speed, pattern):
        # We define the ODE for solve_ivp. 
        # t is time, T is temperature (array of length 1)
        # Returns dT/dt
        P = self.power_profile(t, pattern)
        k_effective = self.k * (0.5 + fan_speed / 100.0)
        dTdt = (P / self.C) - k_effective * (T[0] - self.T_ambient)
        return [dTdt]

    def step_direct(self, T_current, power_draw, fan_speed):
        """
        Single-step physics integration with a direct power value.
        No pattern string needed. Returns new temperature after 1 second.
        """
        k_effective = self.k * (0.5 + fan_speed / 100.0)
        dTdt = (power_draw / self.C) - k_effective * (T_current - self.T_ambient)
        return T_current + dTdt  # Euler step, dt=1s

