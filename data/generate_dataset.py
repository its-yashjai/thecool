import os
import numpy as np
import pandas as pd
from scipy.integrate import solve_ivp
import sys

# Add parent directory to path so we can import simulator
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from simulator import GPUThermalSimulator

def generate_scenario(sim, scenario_id, pattern, duration=600):
    data = []
    T_current = sim.T_ambient + np.random.uniform(5, 25) # Initial temperature 30-50 C
    
    # Simple reactive baseline fan logic to generate training data
    # (Data contains PID-like behaviour so PINN learns how fan affects temp)
    
    rolling_power_window = []
    
    for t in range(duration):
        P = sim.power_profile(t, pattern)
        rolling_power_window.append(P)
        if len(rolling_power_window) > 10:
            rolling_power_window.pop(0)
            
        rolling_power = sum(rolling_power_window) / len(rolling_power_window)
        
        # simple baseline reactive fan
        if T_current > 75:
            fan_speed = min(100.0, max(50.0, (T_current - 70) * 10))
        elif T_current > 60:
            fan_speed = min(50.0, max(20.0, (T_current - 50) * 2))
        else:
            fan_speed = 20.0
            
        # Add a bit of noise to fan speed so model sees varied fan states
        fan_speed = np.clip(fan_speed + np.random.normal(0, 5), 20, 100)
        
        throttle_event = T_current > 85.0
        
        # Run ODE step for 1 second
        sol = solve_ivp(
            sim.step, 
            [t, t+1], 
            [T_current], 
            args=(fan_speed, pattern),
            method='RK45'
        )
        
        T_next = sol.y[0][-1]
        
        data.append({
            'timestamp': t,
            'temperature': T_current,
            'power_draw': P,
            'fan_speed': fan_speed,
            'ambient_temp': sim.T_ambient,
            'rolling_power': rolling_power,
            'throttle_event': throttle_event,
            'scenario_id': scenario_id,
            'workload_pattern': pattern
        })
        
        T_current = T_next
        
    return data

def main():
    os.makedirs(os.path.dirname(os.path.abspath(__file__)), exist_ok=True)
    sim = GPUThermalSimulator()
    all_data = []
    
    patterns = ['idle', 'inference', 'training_burst', 'mixed']
    
    print("Generating 500 scenarios of data...")
    for i in range(500):
        pattern = np.random.choice(patterns)
        scenario_data = generate_scenario(sim, i, pattern, duration=600)
        all_data.extend(scenario_data)
        if (i+1) % 50 == 0:
            print(f"Generated {i+1}/500 scenarios")
            
    df = pd.DataFrame(all_data)
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'synthetic_data.csv')
    df.to_csv(out_path, index=False)
    print(f"Saved {len(df)} rows to {out_path}")

if __name__ == '__main__':
    main()
