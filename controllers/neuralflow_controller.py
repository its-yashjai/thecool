"""
NeuralFlow Controller — Proactive PINN-based cooling controller.
Uses the trained PINN model to predict future GPU temperature and
pre-ramp fans before thermal spikes occur.
"""

import torch
from collections import deque

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.pinn_model import predict_with_uncertainty


class NeuralFlowController:
    def __init__(self, pinn_model, threshold=80.0):
        self.model = pinn_model
        self.threshold = threshold
        self.window = deque(maxlen=30)

    def reset(self):
        self.window.clear()

    def step(self, current_state):
        """
        current_state: list/array of 5 values
            [temperature, power_draw, fan_speed, ambient_temp, rolling_power]
        Returns: fan_speed (float, 20-100)
        """
        self.window.append(current_state)
        temp = current_state[0]

        if len(self.window) < 30:
            # Not enough history yet - use a mild reactive baseline
            if temp > 75:
                return min(100, max(20, (temp - 70) * 8))
            return 20.0

        x = torch.tensor(list(self.window), dtype=torch.float32).unsqueeze(0)
        pred_temp, uncertainty = predict_with_uncertainty(self.model, x, n_samples=20)

        # pred_temp shape: (1, 3) -> predictions at T+30, T+45, T+60
        # Use mean + 1 std as the "expected worst case"
        worst_case = (pred_temp + uncertainty).max().item()
        headroom = self.threshold - worst_case

        if headroom < 0:
            # Predicted to exceed threshold - full blast
            fan_speed = 95.0
        elif headroom < 3:
            # Very close - strong pre-ramp
            fan_speed = 70 + (3 - headroom) * 10
        elif headroom < 10:
            # Approaching threshold - moderate ramp
            fan_speed = 30 + (10 - headroom) * 5.5
        elif headroom < 20:
            # Some distance - gentle pre-cooling
            fan_speed = 20 + (20 - headroom) * 1.0
        else:
            # Safe - minimal cooling
            fan_speed = 20.0

        return max(20, min(100, fan_speed))
