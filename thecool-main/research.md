# NeuralFlow Research Problem and Validation Plan

## Core problem

NeuralFlow should solve this problem:

> How can we predict imminent GPU thermal-limit violations under bursty AI workloads and choose the lowest-cost safe intervention before GPU performance degrades?

This is more defensible than the broader claim of general GPU-cluster thermal management.

NVIDIA exposes GPU temperature, power, utilization, clocks, power limits, and thermal slowdown reasons through `nvidia-smi`. Thermal management is therefore not only about preventing overheating; it is about preventing lost throughput, unstable latency, and unnecessary cooling or power expenditure.

Relevant source: [NVIDIA System Management Interface](https://docs.nvidia.com/deploy/nvidia-smi/index.html)

## What problem are we solving?

A GPU receives a sudden workload burst:

```text
workload burst
   ↓
power increase
   ↓
temperature rises with delay
   ↓
thermal/power slowdown
   ↓
lower clocks and worse job latency
```

The research problem is to predict the future thermal state early enough to intervene.

The optimization objective is:

```text
minimize cooling energy
+ minimize GPU performance loss
+ minimize thermal violations
+ minimize control oscillation
```

Subject to:

```text
GPU temperature < safe limit
power < hardware limit
commands remain within actuator limits
latency and throughput remain acceptable
```

Recent work supports treating compute workload, GPU frequency, power, and cooling as a joint control problem rather than cooling alone. See [Coordinated Cooling and Compute Management for AI Datacenters](https://arxiv.org/abs/2601.08113).

## What the project currently lacks

### 1. A real control action

The current project predicts temperature and changes a simulated `fan_speed`. That is not yet a production control problem.

Possible real actions include:

- GPU power limit;
- GPU frequency or DVFS;
- workload placement;
- batch size or inference concurrency;
- job migration;
- rack airflow;
- fan speed;
- coolant flow or supply temperature.

Many data-center GPUs are passively cooled or controlled through infrastructure systems. If fan speed cannot be controlled, NeuralFlow should act through power, scheduling, or cooling-system APIs.

Recommended first scope:

> Predict thermal-limit risk and recommend or control GPU power limits and workload intensity.

NVIDIA documents programmable GPU power limits on supported devices, with hardware and administrator restrictions. See [NVIDIA Power and Thermals](https://docs.nvidia.com/dccpu/grace-perf-tuning-guide/power-thermals.html).

### 2. Real telemetry

The repository currently has synthetic data only. We need synchronized data containing:

- timestamp;
- GPU temperature;
- board or module power;
- GPU utilization;
- memory utilization;
- clocks;
- throttle reasons;
- power limit;
- workload identity;
- inference latency or training throughput;
- cooling command, if available.

The most important missing label is actual performance degradation. Temperature alone cannot prove thermal throttling. Temperature must be correlated with clocks, throttle reasons, throughput, or latency.

### 3. A calibrated simulator

The current simulator is useful for prototyping, but its thermal parameters are hand-selected. It does not yet model:

- actuator delay;
- fan inertia;
- GPU-specific thermal limits;
- temperature-dependent power;
- power-limit behavior;
- clock throttling;
- workload-to-power nonlinearities;
- multiple thermal nodes;
- rack airflow;
- measurement noise;
- missing telemetry.

Without calibration, a controller can win because the simulator favors it.

### 4. Fair baselines

PID is useful but insufficient. The comparison should include:

- fixed cooling or vendor-default behavior;
- PID;
- data-only LSTM;
- LSTM-PINN;
- MPC using the calibrated thermal model;
- GNN or PINN-GNN;
- RL controller.

Recent data-center control research evaluates safety, unseen loads, and multiple randomized trials. See [Physics-informed ML predictive control for edge datacenters](https://www.sciencedirect.com/science/article/abs/pii/S0306261925017052).

### 5. Proof that PINN helps

The project currently assumes that physics improves the model. This must be tested with ablations:

```text
LSTM
LSTM + Newton cooling loss
LSTM + energy-balance loss
LSTM + both physics losses
```

PINN should only be considered successful if it improves at least one of:

- unseen workload prediction;
- parameter-shift generalization;
- long-horizon rollout stability;
- physical residuals;
- synthetic-to-real transfer;
- uncertainty calibration.

If PINN only improves training loss, it is not solving the real problem.

### 6. Spatial evidence for GNN

A GNN is justified only if neighboring GPUs affect one another in the measured system.

Required data:

- multiple GPUs;
- physical layout;
- synchronized temperatures;
- per-GPU power;
- airflow or cooling topology;
- node-to-node thermal influence.

The current scalar single-GPU dataset cannot validate a GNN. Chip-level GCN work supports graph-based thermal modeling, but the graph must correspond to real physical relationships. See [Miao et al., Real-Time Temperature Prediction for Large-Scale Multi-Core Chips](https://www.mdpi.com/2079-9292/14/6/1223).

The GNN research question should be:

> Does spatial message passing improve prediction of neighboring GPU temperatures or thermal-limit events compared with independent per-GPU models?

If not, the GNN should be removed from the final system.

### 7. A legitimate reason to use reinforcement learning

RL should not be added merely because it is advanced.

RL becomes appropriate when:

- actions have delayed effects;
- actions interact over time;
- there are competing objectives;
- the controller must learn a policy rather than solve one fixed optimization;
- safe exploration can be guaranteed in simulation or shadow mode.

The RL problem is:

> Given predicted thermal risk and workload demand, choose power, frequency, scheduling, or cooling actions that minimize energy while preserving thermal and performance constraints.

RL should operate in:

1. calibrated simulation;
2. replay or offline telemetry;
3. shadow mode;
4. operator-approved recommendations;
5. closed-loop control only after safety evidence.

Google's data-center RL work emphasizes operational safeguards and constraint handling. See [Data Center Cooling using Model-predictive Control](https://research.google/pubs/data-center-cooling-using-model-predictive-control/).

## Recommended research architecture

```text
Telemetry + workload
        ↓
PINN temporal predictor
        ↓
GNN spatial aggregation
        ↓
uncertainty and thermal-risk estimate
        ↓
MPC/RL decision layer
        ↓
safety filter
        ↓
power / DVFS / scheduling / cooling action
```

The roles should remain separate:

- PINN: learn thermally plausible dynamics;
- GNN: represent spatial coupling;
- uncertainty model: detect unreliable predictions;
- MPC or RL: select actions;
- safety layer: prevent unsafe actions;
- fallback controller: maintain operation during failures.

MPC should be implemented before RL because its decisions are easier to inspect and constrain. RL should be a later experiment compared against MPC.

## Smallest credible research project

The first paper should solve this narrower problem:

> Can a physics-regularized temporal model predict GPU thermal-limit events 30–60 seconds ahead under unseen workload bursts, and can that prediction reduce thermal slowdowns with less energy than a reactive controller?

Required first experiment:

1. Collect `nvidia-smi` telemetry from one NVIDIA GPU.
2. Run idle, inference, sustained-training, and burst workloads.
3. Record temperature, power, utilization, clocks, and throttle reasons.
4. Train data-only LSTM and LSTM-PINN models.
5. Split by workload session, never by random rows.
6. Test on a workload pattern excluded from training.
7. Compare PID, MPC, and the current heuristic controller.
8. Measure:
   - temperature MAE/RMSE;
   - 30/45/60-second event recall;
   - false-alarm rate;
   - throttle duration;
   - clock loss;
   - workload throughput or latency;
   - energy;
   - controller latency.

Only after this succeeds should GNN and RL be added.

## True validation criteria

A meaningful result requires:

- thermal-event recall above a predefined threshold;
- low false-alarm rate;
- fewer seconds of thermal slowdown;
- no unacceptable throughput or latency penalty;
- lower cooling or power energy;
- improvement over PID and MPC;
- consistent results across workloads and random seeds;
- valid uncertainty coverage;
- no unsafe action during shadow-mode testing.

Energy savings must be demonstrated against the same workload, hardware, controller limits, and repeated trials. A single favorable simulation trace is not evidence of superiority.

## Final research contribution

The defensible contribution is:

> A validated, uncertainty-aware thermal-risk predictor and constrained controller for bursty GPU workloads, with physics used to improve generalization and spatial/RL extensions evaluated only when the data and control interfaces justify them.

PINN, GNN, and RL are tools within this problem—not the problem themselves.
