"""
evaluate.py — Runs both PID and NeuralFlow controllers side-by-side
on the same workload scenario and logs comparison metrics.
Outputs JSON metrics + static comparison PNGs for presentation slides.
"""

import os
import sys
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.integrate import solve_ivp
from rich.console import Console
from rich.table import Table

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from simulator import GPUThermalSimulator
from controllers.pid_controller import PIDController
from controllers.neuralflow_controller import NeuralFlowController

console = Console()


def run_controller_sim(sim, controller, pattern, duration=600, controller_type='pid'):
    """
    Run one full simulation with a given controller.
    Returns dict of time-series data.
    """
    T = sim.T_ambient + 15.0  # start at ~40°C
    fan_speed = 30.0
    rolling_power_window = []

    history = {
        'time': [], 'temperature': [], 'fan_speed': [], 'power_draw': [],
        'throttle_events': [], 'ambient_temp': [], 'rolling_power': []
    }

    for t in range(duration):
        P = sim.power_profile(t, pattern)
        rolling_power_window.append(P)
        if len(rolling_power_window) > 10:
            rolling_power_window.pop(0)
        rolling_power = sum(rolling_power_window) / len(rolling_power_window)

        throttle = T > 85.0

        history['time'].append(t)
        history['temperature'].append(T)
        history['fan_speed'].append(fan_speed)
        history['power_draw'].append(P)
        history['throttle_events'].append(throttle)
        history['ambient_temp'].append(sim.T_ambient)
        history['rolling_power'].append(rolling_power)

        # Compute next fan speed
        if controller_type == 'pid':
            fan_speed = controller.step(T, dt=1)
        else:
            state = [T, P, fan_speed, sim.T_ambient, rolling_power]
            fan_speed = controller.step(state)

        # Step physics
        sol = solve_ivp(sim.step, [t, t + 1], [T], args=(fan_speed, pattern), method='RK45')
        T = sol.y[0][-1]

    return history


def compute_metrics(history):
    temps = np.array(history['temperature'])
    fans = np.array(history['fan_speed'])
    throttles = np.array(history['throttle_events'])
    powers = np.array(history['power_draw'])

    # Cooling energy: fan power consumption (fan_speed% maps to ~50-300W fan power)
    fan_power_watts = fans * 3.0  # 0%=0W, 100%=300W fan power
    cooling_energy = np.sum(fan_power_watts) / 3600.0  # W.h

    # Total energy includes GPU power + fan power
    total_energy = (np.sum(powers) + np.sum(fan_power_watts)) / 3600.0

    return {
        'peak_temp': float(np.max(temps)),
        'mean_temp': float(np.mean(temps)),
        'temp_std': float(np.std(temps)),
        'cooling_energy_wh': float(cooling_energy),
        'total_energy_wh': float(total_energy),
        'throttle_events': int(np.sum(throttles)),
        'min_temp': float(np.min(temps)),
    }


def generate_comparison_plots(pid_history, nf_history, pid_metrics, nf_metrics, results_dir):
    """Generate publication-quality comparison plots."""
    
    # ── Color palette ────────────────────────────────────────────
    BG       = '#0f0f1a'
    CARD_BG  = '#1a1a2e'
    PID_COL  = '#ff4757'
    NF_COL   = '#2ed573'
    GRID     = '#2a2a40'
    TXT      = '#e0e0e0'
    THRESH   = '#ffa502'
    
    plt.rcParams.update({
        'figure.facecolor': BG,
        'axes.facecolor': CARD_BG,
        'axes.edgecolor': GRID,
        'axes.labelcolor': TXT,
        'text.color': TXT,
        'xtick.color': TXT,
        'ytick.color': TXT,
        'grid.color': GRID,
        'grid.alpha': 0.3,
        'font.family': 'sans-serif',
        'font.size': 11,
    })
    
    time = np.array(pid_history['time'])
    
    # ── Figure 1: Temperature Comparison ──────────────────────────
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.suptitle('NeuralFlow vs PID — Controller Comparison', fontsize=18, fontweight='bold', y=0.98)
    
    # Temperature
    ax = axes[0, 0]
    ax.plot(time, pid_history['temperature'], color=PID_COL, linewidth=1.2, alpha=0.9, label='PID')
    ax.plot(time, nf_history['temperature'], color=NF_COL, linewidth=1.2, alpha=0.9, label='NeuralFlow')
    ax.axhline(y=85, color=THRESH, linestyle='--', alpha=0.7, label='Throttle threshold (85°C)')
    ax.axhline(y=75, color=THRESH, linestyle=':', alpha=0.4, label='PID setpoint (75°C)')
    ax.fill_between(time, pid_history['temperature'], alpha=0.08, color=PID_COL)
    ax.fill_between(time, nf_history['temperature'], alpha=0.08, color=NF_COL)
    ax.set_xlabel('Time (s)')
    ax.set_ylabel('Temperature (°C)')
    ax.set_title('GPU Temperature Over Time', fontsize=13)
    ax.legend(loc='upper right', fontsize=9, framealpha=0.3)
    ax.grid(True)
    
    # Fan Speed
    ax = axes[0, 1]
    ax.plot(time, pid_history['fan_speed'], color=PID_COL, linewidth=1.0, alpha=0.8, label='PID')
    ax.plot(time, nf_history['fan_speed'], color=NF_COL, linewidth=1.0, alpha=0.8, label='NeuralFlow')
    ax.set_xlabel('Time (s)')
    ax.set_ylabel('Fan Speed (%)')
    ax.set_title('Fan / Cooling Output', fontsize=13)
    ax.legend(loc='upper right', fontsize=9, framealpha=0.3)
    ax.grid(True)
    
    # Energy bar chart
    ax = axes[1, 0]
    bars = ax.bar(
        ['PID', 'NeuralFlow'],
        [pid_metrics['cooling_energy_wh'], nf_metrics['cooling_energy_wh']],
        color=[PID_COL, NF_COL], width=0.5, edgecolor='white', linewidth=0.5
    )
    for bar, val in zip(bars, [pid_metrics['cooling_energy_wh'], nf_metrics['cooling_energy_wh']]):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                f'{val:.1f} W·h', ha='center', va='bottom', fontsize=12, fontweight='bold')
    energy_saved = (1 - nf_metrics['cooling_energy_wh'] / pid_metrics['cooling_energy_wh']) * 100
    ax.set_title(f'Cooling Energy — {energy_saved:.1f}% Saved', fontsize=13)
    ax.set_ylabel('Energy (W·h)')
    ax.grid(True, axis='y')
    
    # Throttle events + stats
    ax = axes[1, 1]
    ax.axis('off')
    stats_text = (
        f"{'Metric':<24} {'PID':>10} {'NeuralFlow':>12}\n"
        f"{'-' * 48}\n"
        f"{'Peak Temperature':<24} {pid_metrics['peak_temp']:>9.1f}C  {nf_metrics['peak_temp']:>11.1f}C\n"
        f"{'Mean Temperature':<24} {pid_metrics['mean_temp']:>9.1f}C  {nf_metrics['mean_temp']:>11.1f}C\n"
        f"{'Temp Variance':<24} {pid_metrics['temp_std']:>9.1f}C  {nf_metrics['temp_std']:>11.1f}C\n"
        f"{'Cooling Energy':<24} {pid_metrics['cooling_energy_wh']:>8.1f} Wh  {nf_metrics['cooling_energy_wh']:>10.1f} Wh\n"
        f"{'Throttle Events':<24} {pid_metrics['throttle_events']:>10d} {nf_metrics['throttle_events']:>12d}\n"
        f"{'-' * 48}\n"
        f"{'Energy Saved':<24} {'--':>10} {energy_saved:>11.1f}%"
    )
    ax.text(0.05, 0.95, stats_text, transform=ax.transAxes, fontsize=11,
            verticalalignment='top', fontfamily='monospace',
            bbox=dict(boxstyle='round,pad=0.5', facecolor=CARD_BG, edgecolor=GRID, alpha=0.8))
    ax.set_title('Summary Metrics', fontsize=13)
    
    plt.tight_layout(rect=[0, 0, 1, 0.95])
    plt.savefig(os.path.join(results_dir, 'comparison_plot.png'), dpi=200, bbox_inches='tight')
    plt.close()
    console.print(f"[green]OK Saved comparison_plot.png[/green]")
    
    # ── Figure 2: Energy bar standalone ──────────────────────────
    fig2, ax2 = plt.subplots(figsize=(8, 5))
    bars = ax2.bar(
        ['PID Controller', 'NeuralFlow (PINN)'],
        [pid_metrics['cooling_energy_wh'], nf_metrics['cooling_energy_wh']],
        color=[PID_COL, NF_COL], width=0.45, edgecolor='white', linewidth=0.5
    )
    for bar, val in zip(bars, [pid_metrics['cooling_energy_wh'], nf_metrics['cooling_energy_wh']]):
        ax2.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.3,
                 f'{val:.1f} W·h', ha='center', va='bottom', fontsize=14, fontweight='bold')
    ax2.set_title(f'Cooling Energy Consumption — {energy_saved:.1f}% Reduction', fontsize=14, fontweight='bold')
    ax2.set_ylabel('Energy (W·h)')
    ax2.grid(True, axis='y')
    plt.tight_layout()
    plt.savefig(os.path.join(results_dir, 'energy_bar.png'), dpi=200, bbox_inches='tight')
    plt.close()
    console.print(f"[green]OK Saved energy_bar.png[/green]")


def main():
    import torch
    from models.pinn_model import PINNModel

    results_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results')
    os.makedirs(results_dir, exist_ok=True)

    # Seed for reproducibility
    np.random.seed(42)

    sim = GPUThermalSimulator()
    pattern = 'mixed'
    duration = 600

    console.print("\n[bold cyan]=== NeuralFlow Evaluation ===[/bold cyan]\n")

    # ── PID run ───────────────────────────────────────────────────
    console.print("[yellow]Running PID controller...[/yellow]")
    np.random.seed(42)
    pid = PIDController(Kp=2.0, Ki=0.1, Kd=0.5, setpoint=70.0)
    pid_history = run_controller_sim(sim, pid, pattern, duration, 'pid')
    pid_metrics = compute_metrics(pid_history)

    # ── NeuralFlow run ────────────────────────────────────────────
    console.print("[yellow]Running NeuralFlow controller...[/yellow]")
    np.random.seed(42)

    model_path = os.path.join('models', 'trained_pinn.pt')
    if os.path.exists(model_path):
        model = PINNModel(input_size=5, hidden_size=64, num_layers=2)
        model.load_state_dict(torch.load(model_path, map_location='cpu', weights_only=True))
        console.print("[green]OK Loaded trained PINN model[/green]")
    else:
        console.print("[red]WARNING No trained model found - using untrained PINN (results will be suboptimal)[/red]")
        model = PINNModel(input_size=5, hidden_size=64, num_layers=2)

    nf_controller = NeuralFlowController(model, threshold=80.0)
    nf_history = run_controller_sim(sim, nf_controller, pattern, duration, 'neuralflow')
    nf_metrics = compute_metrics(nf_history)

    # ── Results table ─────────────────────────────────────────────
    energy_saved = (1 - nf_metrics['total_energy_wh'] / max(pid_metrics['total_energy_wh'], 0.01)) * 100

    table = Table(title="Controller Comparison Results", style="bold", border_style="cyan")
    table.add_column("Metric", style="white", justify="left")
    table.add_column("PID", style="red", justify="right")
    table.add_column("NeuralFlow", style="green", justify="right")

    table.add_row("Peak Temperature", f"{pid_metrics['peak_temp']:.1f}C", f"{nf_metrics['peak_temp']:.1f}C")
    table.add_row("Mean Temperature", f"{pid_metrics['mean_temp']:.1f}C", f"{nf_metrics['mean_temp']:.1f}C")
    table.add_row("Temp Variance", f"+/-{pid_metrics['temp_std']:.1f}C", f"+/-{nf_metrics['temp_std']:.1f}C")
    table.add_row("Cooling Energy", f"{pid_metrics['cooling_energy_wh']:.1f} Wh", f"{nf_metrics['cooling_energy_wh']:.1f} Wh")
    table.add_row("Throttle Events", str(pid_metrics['throttle_events']), str(nf_metrics['throttle_events']))
    table.add_row("Energy Saved", "--", f"{energy_saved:.1f}%", style="bold")

    console.print(table)

    # ── Save metrics JSON ─────────────────────────────────────────
    metrics = {
        'pid': pid_metrics,
        'neuralflow': nf_metrics,
        'energy_saved_pct': energy_saved,
        'pattern': pattern,
        'duration': duration,
    }
    with open(os.path.join(results_dir, 'metrics.json'), 'w') as f:
        json.dump(metrics, f, indent=2)
    console.print(f"\n[green]OK Metrics saved to results/metrics.json[/green]")

    # ── Save time-series for dashboard ────────────────────────────
    import pandas as pd
    pid_df = pd.DataFrame(pid_history)
    pid_df['controller'] = 'PID'
    nf_df = pd.DataFrame(nf_history)
    nf_df['controller'] = 'NeuralFlow'
    combined = pd.concat([pid_df, nf_df], ignore_index=True)
    combined.to_csv(os.path.join(results_dir, 'comparison_data.csv'), index=False)
    console.print(f"[green]OK Time-series data saved to results/comparison_data.csv[/green]")

    # ── Generate plots ────────────────────────────────────────────
    generate_comparison_plots(pid_history, nf_history, pid_metrics, nf_metrics, results_dir)

    console.print("\n[bold green]Evaluation complete![/bold green]\n")


if __name__ == '__main__':
    main()
