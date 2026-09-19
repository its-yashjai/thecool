# NeuralFlow: A Physics-Informed LSTM Neural Network for Proactive GPU Cluster Thermal Management

**Yash Jai** (<yashjaimail@gmail.com>) · **NeuralFlow Research** · **2026**  
*Project Repository:* [github.com/its-yashjai/thecool](https://github.com/its-yashjai/thecool)

---

> **Paper status:** Draft — Sections 1, 2 & 3 complete. Sections 4–8 to be filled as experiments run.
> **Target journal:** Applied Thermal Engineering / IEEE Access
> **Citation style:** IEEE numeric [N]

---

## Abstract

*(Write last — after all results are in)*

---

## 1. Introduction

The rapid proliferation of artificial intelligence workloads has triggered an unprecedented surge in global data center energy consumption. Large language models (LLMs) and deep learning inference services require dense GPU clusters operating at sustained high power draw, creating thermal management conditions that existing infrastructure was never designed to handle. According to the International Energy Agency, data center electricity consumption is projected to reach 945 TWh by 2030, growing at approximately 15% per year — more than four times faster than any other sector [1]. Cooling systems alone account for 30–40% of total data center energy expenditure, making thermal management optimization one of the highest-leverage interventions available to the industry [2].

The dominant thermal control paradigm in production GPU clusters remains the Proportional-Integral-Derivative (PID) controller, a feedback mechanism conceptualized in the 1960s. PID controllers are fundamentally reactive: they respond only after temperature sensors report a threshold violation, introducing an inherent 10–30 second lag during which GPU junction temperatures may already exceed safe operating bounds. This lag forces one of two unacceptable outcomes — either the GPU engages thermal throttling, which reduces AI inference throughput by up to 30%, or the cooling system overcools as a safety buffer, wasting 15–20% of additional energy [3]. In both cases, the root cause is the same: the controller has no awareness of imminent thermal events and therefore cannot act before damage accumulates.

The limitations of reactive control have motivated the application of machine learning to data center thermal management. A landmark deployment by Google DeepMind in 2016 demonstrated that reinforcement learning (RL) agents could reduce facility cooling costs by approximately 40% in a production data center, establishing AI-based control as a commercially viable direction [4]. Subsequent work has extended RL-based approaches to multi-zone cooling optimization, chiller plant control, and workload-aware energy management [5, 6]. However, pure RL approaches carry structural limitations that restrict their applicability to safety-critical thermal management: (i) they operate as black-box policies with no physical interpretability, making it difficult to certify safe behavior under unseen workload conditions; (ii) they require large volumes of interaction data from the target environment, which is expensive or dangerous to collect during live GPU operation; and (iii) they provide no mechanism for quantifying prediction uncertainty, leaving the controller without confidence bounds on its thermal forecasts [7].

Physics-Informed Neural Networks (PINNs), introduced by Raissi et al. in 2019, offer a principled alternative that addresses these limitations by embedding governing physical equations directly into the neural network training objective [8]. Rather than learning purely from observed data, a PINN is penalized during training for any prediction that violates known physical laws — in the thermal domain, Newton's Law of Cooling and the energy conservation equation. This physical grounding dramatically reduces data requirements, improves generalization to unseen operating conditions, and produces predictions that are by construction physically plausible. The PINN framework has since been applied to thermal modeling in buildings [9], battery temperature estimation [10], steam generator control [11], and most recently to chip-level thermal field prediction [12, 13].

The literature reviewed here shows related work in facility cooling control, LSTM-PINN thermal prediction, and chip-level GCN prediction, but it does not establish the complete combination proposed here. We therefore frame the GPU-cluster PINN-GNN-control combination as a research hypothesis and reproducibility target, not as a proven absence claim. Existing facility-level approaches operate at a coarser granularity, while chip-level thermal modeling using graph neural networks has been demonstrated [14]. The combination of LSTM-based temporal modeling, multi-term physics-informed loss, proactive cooling control, and uncertainty quantification remains to be tested rigorously for this domain.

This paper introduces **NeuralFlow**, a proposed physics-informed temporal-to-spatial framework for proactive GPU thermal management. The current implementation forecasts GPU temperature 30–60 seconds ahead in simulation and uses a heuristic controller to pre-ramp cooling output. Real-telemetry, spatial-GNN, and closed-loop RL validation are planned experiments; they are not reported as completed in this draft.

### 1.1 Contributions

The specific contributions of this work are as follows:

1. **A reproducible LSTM-PINN baseline for GPU thermal prediction.** We establish a single-GPU simulation baseline and define the evidence required before making a GPU-cluster novelty claim. The relationship to the GCN direction identified by Miao et al. [14] motivates, but does not itself validate, the later PINN-GNN stage.

2. **Proactive controller with uncertainty estimation.** We combine temperature forecasting with Monte Carlo Dropout to produce an uncertainty estimate used by the current heuristic controller. Calibration is a planned validation task; until coverage is measured, the estimates are not called calibrated confidence bounds.

3. **Multi-term physics loss hypothesis.** We formulate a training objective comprising data fidelity, Newton's Law of Cooling, and energy-balance residuals. Ablation and out-of-distribution experiments will determine whether the multi-term formulation improves generalization under workload bursts.

4. **Real-data validation protocol.** We define a held-out `nvidia-smi` telemetry experiment for synthetic-to-real transfer without fine-tuning. This contribution is prospective until the telemetry is collected and evaluated.

5. **A staged PINN-GNN-control research methodology.** We define, but do not yet claim to have completed, a progression from a single-GPU physics-regularized temporal predictor to a spatially coupled PINN-GNN and finally to a safety-constrained reinforcement-learning controller. Each stage is accepted only after passing leakage-resistant predictive, physical-consistency, and closed-loop safety tests.

The remainder of this paper is organized as follows. Section 2 reviews related work in physics-informed neural networks, data center thermal management, and GPU chip thermal modeling. Section 3 presents the NeuralFlow architecture and training formulation. Section 4 describes the experimental setup, simulation environment, and real-data collection methodology. Section 5 presents results and comparative analysis. Section 6 discusses limitations and directions for future work. Section 7 concludes.

---

## 2. Related Work

### 2.1 Physics-Informed Neural Networks

Physics-Informed Neural Networks were introduced by Raissi, Perdikaris, and Karniadakis in a foundational 2019 paper as a framework for solving forward and inverse problems governed by partial differential equations [8]. The core idea is to augment the neural network training loss with a residual term that penalizes solutions inconsistent with known governing equations. The network simultaneously minimizes error against observed data and error against the physical law, yielding solutions that are both data-consistent and physically plausible. This approach has proven particularly effective in data-scarce regimes, where pure data-driven models overfit and pure physics-based solvers are computationally prohibitive.

Since their introduction, PINNs have been extended across a wide range of thermal and fluid mechanics problems. Relevant to our work, Cho et al. [10] demonstrated an LSTM-PINN hybrid for battery temperature prediction, achieving root mean square errors of 0.57°C under dynamic charge profiles. Their finding that LSTM-PINN outperforms standalone LSTM specifically when the temperature range is large — precisely the condition that occurs during GPU workload bursts — directly motivates our architectural choice. A more recent paper (April 2026) by Liu et al. [15] introduced an LSTM-PINN framework for electrothermal transport, using depth-recursive memory to preserve long-range spatial feature dependencies across coupled heat and fluid flow fields, demonstrating the continued active development of this architecture class.

Fanoodi et al. [11] performed a direct comparative study of PINNs versus LSTM networks for steam temperature control in heat recovery steam generators, evaluating both architectures as adaptive controllers under normal and fault conditions. Their results show that the PINN controller, by integrating thermodynamic laws into online learning, generalizes more robustly to unseen fault scenarios than the purely data-driven LSTM — providing further motivation for physics-informed approaches in safety-critical thermal control.

A 20-year retrospective on power and thermal modeling [16] explicitly identifies PINNs as a promising avenue for fast and physics-consistent thermal predictions in chip-level scenarios, while noting remaining challenges including training instability and weak cross-design transferability. Our work directly addresses the cross-domain transferability concern through real-data validation.

### 2.2 AI-Based Data Center Thermal and Cooling Control

The application of machine learning to data center energy management has grown substantially since DeepMind's landmark 2016 deployment, which demonstrated a 40% reduction in cooling costs using reinforcement learning agents trained on facility sensor data [4]. Subsequent work has established RL-based cooling control as a viable operational strategy, though limitations around black-box behavior and data requirements have motivated alternative approaches.

Model Predictive Control (MPC) combined with machine learning predictors has emerged as a transparent alternative. Chen et al. [2], in the most directly related published work, propose a Physics-Informed Machine Learning MPC (PIML-MPC) framework for edge data center cooling, embedding adaptive physically consistent neural networks into an MPC loop controlling water-side cooling components (chillers, cooling towers, heat exchangers). Validated on the Sustainable Tropical Data Centre Testbed at the National University of Singapore, their framework achieves a 12.6% energy reduction versus fixed-setpoint control and an additional 9.1% reduction under unseen high-load conditions. This work represents the current state of the art in physics-informed cooling control.

Our work is distinguished from Chen et al. in two critical respects. First, their system operates at the facility water-side level (chiller supply temperature, pump flow rates) and does not address GPU chip-level thermal dynamics or sub-minute power transients. Second, their control architecture is MPC-based, requiring an explicit optimization over a receding horizon, while NeuralFlow uses direct proactive prediction — a simpler, lower-latency control scheme suited to the second-level timescales of GPU thermal events.

Related work on data center cooling load prediction using LSTM models [17] has demonstrated the effectiveness of recurrent architectures for capturing temporal dependencies in server power draw. However, these approaches remain purely data-driven, lacking physical constraints that would enable reliable generalization to novel workload patterns.

### 2.3 GPU Chip-Level Thermal Modeling

Thermal modeling at the chip level presents distinct challenges compared to facility-level approaches: spatial non-uniformity across compute cores, millisecond-scale transients during kernel execution, and strong coupling between adjacent chips in a cluster through shared airflow paths. Lu and Tan [13] presented the first publicly available thermal map dataset for commercial CPUs, GPUs, and TPUs, including an NVIDIA GeForce RTX 4060 GPU, obtained via infrared thermal imaging under realistic workloads. They reviewed DNN-based thermal map estimation methods including LSTM, GAN, and transformer-based models trained on this data, providing both the dataset and the benchmark against which we evaluate.

Miao et al. [14] proposed a real-time chip temperature prediction framework for large-scale multi-core processors using Graph Convolutional Networks, modeling spatial thermal coupling between adjacent processor cores as a graph. Their GCN approach reports improved prediction accuracy and low inference latency under its evaluated chip configurations. We use this as motivation for testing a physics-constrained graph model, but do not attribute an explicit PINN future-work statement to Miao et al. without checking the final paper text. The PINN-GNN combination is therefore a NeuralFlow research hypothesis, not an established literature gap.

### 2.4 Real-World GPU Cluster Telemetry

For workload validation, the Alibaba GPU Cluster Trace dataset [18] provides anonymized operational traces from large-scale production GPU clusters. The published 2020 trace describes more than 6,000 GPUs in Alibaba's production MLaaS cluster [18]. The traces provide workload and resource signals, not direct GPU temperature; utilization-to-power conversion is therefore a modeling assumption that must be calibrated separately. We do not include an unverified “v2026” cluster-size claim in the evidence base.

NVIDIA's System Management Interface (nvidia-smi) provides direct access to real-time GPU telemetry including temperature, power draw, utilization, memory usage, and clock speed at up to 1-second resolution [19]. This enables the collection of real GPU thermal time-series under controlled workload conditions without requiring access to hyperscale infrastructure. We use nvidia-smi telemetry collected under three workload conditions (idle, inference, and training burst) as our real-world validation dataset, providing ground-truth temperature and power draw measurements against which our simulation-trained model is evaluated.

### 2.5 Summary of Research Gaps

Table 1 summarizes the positioning of NeuralFlow relative to the most closely related prior works.

| Work | Level | Physics-Informed | Proactive Control | Uncertainty | GPU Chip | Spatial Coupling |
|---|---|---|---|---|---|---|
| DeepMind [4] | Facility | ✗ | ✗ | ✗ | ✗ | ✗ |
| Chen et al. [2] | Water-side | ✓ | ✗ (MPC) | ✗ | ✗ | ✗ |
| Cho et al. [10] | Battery | ✓ | ✗ | ✗ | ✗ | ✗ |
| Miao et al. [14] | Chip (GCN) | ✗ | ✗ | ✗ | ✓ | ✓ |
| Lu & Tan [13] | Chip (map) | ✗ | ✗ | ✗ | ✓ | ✗ |
| **NeuralFlow Stage 1 (implemented)** | **Single-GPU simulation** | **✓** | **✓ (heuristic)** | **estimate only** | **✓ (scalar)** | **—** |
| **NeuralFlow Stages 2–3 (proposed)** | **GPU cluster** | **to test** | **to test** | **to calibrate** | **to test** | **to test** |

The reviewed sources do not establish a directly comparable system combining all five dimensions. NeuralFlow is positioned as a staged attempt to evaluate that combination; Table 1 must be updated after experiments and must not mark a dimension as demonstrated before its validation gate is passed.

---

## 3. Datasets

This section documents every dataset used in this work — for training, validation, and real-world generalization testing. All datasets are publicly accessible; direct links and access instructions are provided for reproducibility.

---

### 3.1 Primary Training Data — Synthetic Simulation

**Source:** Generated locally using NeuralFlow's GPU thermal simulator (`generate_dataset.py`)

**Why synthetic first:** Synthetic data provides controlled ground truth: the physics parameters (k, C, and T_ambient) used to generate each trajectory. This permits residual and rollout tests, but it does not by itself show that a model has learned real GPU behavior. Synthetic-to-real transfer is a separate experiment described in Section 5.3.

**Generation procedure:**
- 500 randomized scenarios, each 600 seconds at 1-second resolution
- Per scenario, randomly sample: cooling constant k ∈ [0.03, 0.08], thermal mass C ∈ [400, 600] J/°C, ambient temperature T_ambient ∈ [20, 35]°C, workload pattern ∈ {idle, inference, training_burst, mixed}
- Total: ~300,000 rows, ~20MB CSV

**Schema:**

| Column | Type | Description |
|---|---|---|
| timestamp | int | Seconds since simulation start |
| temperature | float | GPU temperature (°C) |
| power_draw | float | GPU power draw (Watts) |
| fan_speed | float | Cooling output (0–100%) |
| ambient_temp | float | Room temperature (°C) |
| rolling_power_10s | float | Mean power over last 10 seconds |
| throttle_event | bool | True if temperature > 85°C |
| scenario_id | int | Scenario index (0–499) |
| workload_pattern | str | idle / inference / training_burst / mixed |

**Access:** Generated locally. Script available in repository at `data/generate_dataset.py`.

---

### 3.2 Alibaba GPU Cluster Trace

**What it is:** Anonymized operational traces from Alibaba's production GPU clusters. The most realistic publicly available GPU workload dataset. Provides GPU utilization over time from real AI and ML jobs — which we convert to power draw estimates using a standard linear power model: `P = P_idle + utilization × (P_max - P_idle)`.

**Versions available:**

| Version | GPUs | Machines | Duration | Notes |
|---|---|---|---|---|
| v2017 | ~1,800 | ~1,300 | 12 days | CPU only, workload patterns |
| v2020 | ~6,500 | ~4,000 | 8 days | First GPU trace, widely cited |
| v2023 | ~6,200 | ~1,200 | Varies | AI/ML workloads, diverse specs |

**How we use it:** Extract GPU utilization time-series → convert to power draw → feed into our thermal ODE as a realistic workload signal. This replaces synthetic random spikes with real job scheduling patterns.

**Direct links:**
- Main repository: https://github.com/alibaba/clusterdata
- GPU v2023 specifically: https://github.com/alibaba/clusterdata/tree/master/cluster-trace-gpu-v2023
- GPU v2020: https://github.com/alibaba/clusterdata/tree/master/cluster-trace-gpu-v2020
- Paper describing the dataset: https://arxiv.org/abs/2307.15976

**Access:** Free, no registration required. Clone the repo or download individual trace files directly.

```bash
git clone https://github.com/alibaba/clusterdata
cd clusterdata/cluster-trace-gpu-v2023
# Files: machine_spec.csv, gpu_task.csv, task_usage.csv
```

---

### 3.3 Commercial Thermal Map Dataset (UC Riverside VSCLAB)

**What it is:** The closest available dataset to real GPU chip-level thermal ground truth. Contains 2D transient thermal maps (temperature distributions in °C) for real commercial hardware including NVIDIA GeForce RTX 4060 GPU, Intel Core i7-8650U CPU, and Google TPU v3. Data collected via infrared thermal imaging under realistic workloads.

**Why this matters for our paper:** This dataset provides actual spatial temperature distributions across a GPU die — ground truth for validating thermal map predictions, not just scalar temperature readings. Used in Lu & Tan [13], which is our dataset citation.

**Schema:**
- `input`: array of performance counter / workload descriptor features
- `output`: 2D thermal map in °C (spatial temperature distribution across chip)

**Direct links:**
- GitHub (representative samples, free direct download): https://github.com/sheldonucr/commercial_thermal_map_dataset
- Full dataset on request: Email `sheldon@ece.ucr.edu` (Prof. Sheldon Tan, UCR VSCLAB). Mention you are citing their MLCAD 2024 paper — academics respond within a week.
- Associated paper (cite this): https://dl.acm.org/doi/10.1145/3670474.3685963

```bash
git clone https://github.com/sheldonucr/commercial_thermal_map_dataset
# Available files: GPU_RTX4060.pkl, CPU_i7_8650U.pkl, TPU_v3.pkl
# Load: import pickle; data = pickle.load(open('GPU_RTX4060.pkl', 'rb'))
# data['input']  → workload features  shape: (N, num_features)
# data['output'] → thermal map (°C)   shape: (N, H, W)
```

---

### 3.4 SPEC Power Benchmark Results

**What it is:** Published benchmark results from the Standard Performance Evaluation Corporation measuring server power consumption at multiple utilization levels (0%, 10%, 20%, ..., 100%). Over 960 server runs from real production hardware across dozens of vendors and configurations. Provides accurate utilization → power draw mappings for real server hardware.

**How we use it:** Extract `(utilization%, power_watts)` pairs for server configurations closest to GPU server specs → use as ground-truth power model to calibrate synthetic simulator parameters → ensures our ODE uses physically realistic power draw values.

**Direct links:**
- Results browser (no login required): https://www.spec.org/power_ssj2008/results/
- All results downloadable as `.txt` files from the results page
- How to parse: each result file contains a table of `target_load%` vs `average_watts`

**Note:** The benchmark tool itself requires SPEC membership (~$2,500/year), but all published results are freely accessible. You only need the results, not the tool.

---

### 3.5 Real GPU Telemetry — nvidia-smi (Self-Collected)

**What it is:** Real-time GPU telemetry from any NVIDIA GPU, collected using NVIDIA's System Management Interface. Provides temperature (°C), power draw (W), GPU utilization (%), memory usage (MB), and SM clock speed (MHz) at up to 1-second resolution. This is our primary real-world validation dataset.

**Why this is sufficient for the paper:** The physics of Newton's Law of Cooling are scale-invariant — a laptop GPU and an H100 follow the same ODE, just with different parameter values. Our claim is that the physics-informed loss enables cross-domain generalization. Validating on any real GPU telemetry substantiates this claim.

**Collection command:**

```bash
# Log every 1 second to CSV — run this while performing workloads
nvidia-smi \
  -lms 1000 \
  --query-gpu=timestamp,temperature.gpu,power.draw,utilization.gpu,\
              memory.used,clocks.current.sm \
  --format=csv,noheader,nounits \
  > gpu_realdata_$(date +%Y%m%d_%H%M%S).csv
```

**Three workload conditions to collect (30 min total):**

| Condition | Duration | How to generate |
|---|---|---|
| Idle | 10 min | Leave GPU doing nothing |
| Inference | 10 min | `ollama run llama3` or run any PyTorch inference loop |
| Training burst | 10 min | Train any model: `python train_mnist.py` |

**Output schema:**

| Column | Unit | Description |
|---|---|---|
| timestamp | datetime | Wall-clock time |
| temperature.gpu | °C | GPU junction temperature |
| power.draw | W | Instantaneous power draw |
| utilization.gpu | % | GPU compute utilization |
| memory.used | MB | VRAM in use |
| clocks.current.sm | MHz | Streaming multiprocessor clock |

**Access:** Built into any NVIDIA driver installation. No download required. Verify availability:

```bash
nvidia-smi --query-gpu=name --format=csv,noheader
# Should print your GPU model name
```

---

### 3.6 HP SustainCluster Dataset

**What it is:** A simulated data center environment providing AI workloads derived from the Alibaba Cluster Trace 2020 GPU dataset, alongside real-world electricity prices, grid carbon intensity signals, and ambient temperature data from multiple geographic locations. Designed for energy and carbon-aware scheduling research.

**How we use it:** Ambient temperature data (T_ambient parameter in our ODE) correlated with real grid carbon intensity. This enables a richer simulation where cooling decisions account for both thermal and environmental cost — a natural extension discussed in Section 6 (Future Work).

**Direct links:**
- GitHub repository: https://github.com/HewlettPackard/sustain-cluster
- Paper: https://arxiv.org/abs/2306.09053

```bash
git clone https://github.com/HewlettPackard/sustain-cluster
# Key files: workloads/, energy_data/, carbon_intensity/
```

---

### 3.7 Google Cluster Traces 2011

**What it is:** A 29-day trace of machine utilization (CPU, memory) from a Google production cluster, covering ~12,500 machines. One of the most widely cited cluster workload datasets in systems research. CPU utilization → power draw conversion gives realistic non-GPU workload patterns for mixed-server scenarios.

**Direct links:**
- GitHub: https://github.com/google/cluster-data
- Paper: https://research.google/pubs/pub40578/
- Direct file download: https://commondatastorage.googleapis.com/clusterdata-2011-2/

```bash
# Download a single day's task usage (manageable size ~500MB)
wget https://commondatastorage.googleapis.com/clusterdata-2011-2/task_usage/part-00001-of-00500.csv.gz
```

---

### 3.8 Dataset Usage Summary

| Dataset | Role | Split | Size | Access |
|---|---|---|---|---|
| Synthetic (ours) | Primary training | 70% train / 15% val / 15% test | ~300K rows | Generated locally |
| Alibaba GPU v2020/v2023 | Realistic workload patterns | Workload signal only | Varies | Public repository; verify release and license |
| UCR Thermal Maps | Chip-level ground truth | Validation (GPU RTX 4060) | Varies | Public samples; full data by request |
| SPEC Power | Power model calibration | Parameter fitting | ~5MB | Free, spec.org |
| nvidia-smi (ours) | Real-world generalization test | Held-out test set | To be collected | Self-collected, not a public dataset |
| SustainCluster | Ambient + carbon data | Future work / Section 6 | ~200MB | Free, GitHub |
| Google Traces 2011 | Workload pattern diversity | Supplementary | ~500MB/day | Free, GCS |

---

## 4. Methodology

This work is organized as a staged research program. The current repository implements Stage 1 only: a single-GPU simulator, an LSTM with physics-regularized loss, and a heuristic proactive controller. Stages 2 and 3 are proposed experiments and must not be described as completed results until their datasets, code, and comparisons are released.

### 4.1 Thermal state and simulator

For each GPU node (i), the initial control-oriented model is a first-order lumped thermal model:

\[
C_i\frac{dT_i}{dt}=P_i(t)-K_i(u_i,t)(T_i-T_{amb}) .
\]

Here (T_i) is measured GPU temperature, (P_i) is board power, (u_i) is the cooling command, (C_i) is effective thermal capacitance, and (K_i) is an effective heat-transfer coefficient. The simulator must expose the parameters, integration step, sensor noise, actuator delay, fan limits, and workload trace so that experiments are reproducible. Parameters are first sampled for synthetic data and then calibrated against held-out telemetry; they are not assumed to transfer unchanged between GPU models.

### 4.2 Stage 1: temporal LSTM-PINN predictor

The predictor receives a fixed history of temperature, power, fan command, ambient temperature, and rolling power. It outputs a multi-horizon forecast ((\hat T_{t+30},\hat T_{t+45},\hat T_{t+60})). The training objective is:

\[
\mathcal L=\lambda_d\mathcal L_{data}+\lambda_{ode}\mathcal L_{ode}+\lambda_{bal}\mathcal L_{balance}+\lambda_r\mathcal L_{reg}.
\]

The data term is forecast MSE or MAE. The ODE residual is evaluated at every forecast interval using the sample-specific ambient temperature and the actual time step. The balance term checks consistency of predicted temperature change with measured or modeled power and cooling. All residuals are normalized by physically meaningful scales before weighting. A data-only LSTM, a single-physics-term model, and the full multi-term model are mandatory ablations. Physics regularization is treated as a hypothesis to test, not as proof that predictions are physically correct.

MC Dropout is used initially as a practical uncertainty baseline. It produces a predictive mean and dispersion, but it is not called calibrated until coverage and sharpness are measured on held-out data. Calibration metrics include 50%, 80%, and 95% empirical interval coverage, interval width, RMSE, and negative log-likelihood where a probabilistic likelihood is available.

### 4.3 Stage 2: spatial PINN-GNN predictor

The cluster is represented as a graph (G=(V,E,A)). A node is one GPU or one spatial thermal region; an edge represents a physically justified thermal interaction. Candidate edge weights are based on measured layout distance, airflow direction, shared cold-plate or rack location, or a learned residual correction constrained to remain non-negative where appropriate. The graph model combines temporal encoding at each node with message passing:

\[
h_i^{(l+1)}=\phi\left(W_0h_i^{(l)}+\sum_{j\in\mathcal N(i)}A_{ij}W_1h_j^{(l)}\right).
\]

The output is a temperature forecast for every node. The loss adds spatial heat-diffusion consistency and boundary/initial-condition terms to the Stage 1 temporal and ODE losses. We will compare: (a) independent LSTMs, (b) LSTM with fixed physical adjacency, (c) GCN/GNN without physics, and (d) the proposed PINN-GNN. This design follows chip-thermal GCN work that constructs adjacency from physical proximity and evaluates the accuracy/latency trade-off, while adding physics constraints as a separate hypothesis to test [14].

The GNN stage requires spatial ground truth. Scalar `nvidia-smi` temperature is insufficient to validate a thermal map or airflow graph. Therefore, Stage 2 uses either synchronized multi-GPU telemetry with a documented physical layout or the UCR thermal-map dataset; it cannot be claimed from the current single-GPU CSV.

### 4.4 Stage 3: constrained reinforcement-learning controller

RL is introduced only after the predictor has been evaluated offline. The environment is a calibrated digital twin whose state contains recent temperatures, powers, ambient conditions, workload features, predicted temperature distributions, uncertainty estimates, and actuator states. The action is a bounded fan/cooling command, optionally with a slew-rate limit. The reward is:

\[
r_t=-\alpha E_t-\beta\sum_i\max(0,T_i-T_{safe})^2-\gamma\sum_i\max(0,T_i-T_{crit})-\eta\lVert u_t-u_{t-1}\rVert^2.
\]

The controller is first trained offline or in simulation. Candidate algorithms are a model-based actor-critic or constrained SAC/PPO baseline, compared against PID, the current heuristic NeuralFlow controller, and MPC using the same thermal model. The predictor is used as a world model or observation encoder; RL does not replace the safety model.

Every RL action passes through a safety layer. The layer clips actuator limits and slew rate, rolls the action forward through the calibrated model, and overrides it when the upper uncertainty bound violates the temperature constraint. A conservative fallback controller remains active during sensor failure, model disagreement, out-of-distribution states, or excessive uncertainty. A reward penalty alone is not considered a safety guarantee. Any claim of safe RL must report intervention rate, constraint violations, worst-case temperature, recovery time, and the assumptions under which the safety layer is valid. This follows the safety concerns documented in real data-center RL deployments and the safe-RL literature [25–27].

### 4.5 Research sequence and stopping rules

The stages are sequential:

1. Establish a leakage-free single-GPU benchmark and reproduce the simulator baseline.
2. Test whether physics terms improve prediction, physical residuals, OOD performance, and uncertainty calibration.
3. Add spatial data and test whether GNN message passing improves multi-node forecasts without unacceptable latency.
4. Add constrained RL only after the predictive model and safety fallback pass offline tests.
5. Conduct shadow-mode testing on real telemetry before any actuator is controlled.

Failure to pass a stage stops the next stage. For example, if PINN does not improve OOD performance or calibrated coverage, the paper reports that result rather than escalating to a more complex architecture.

---

## 5. Experimental Setup

### 5.1 Data splits and reproducibility

Synthetic trajectories are split by `scenario_id`, never by randomly shuffling overlapping windows: 70% train, 15% validation, and 15% test. The real telemetry test set is held out by collection session and workload, not by adjacent rows. Every run records the seed, GPU model, driver, sampling period, simulator parameters, model version, and software environment. At least five independent seeds are used for final comparisons, with mean, standard deviation, and 95% confidence intervals.

### 5.2 Validation layers

Validation is reported at four levels:

1. **Forecast accuracy:** MAE, RMSE, maximum absolute error, and error at each horizon.
2. **Physical consistency:** normalized ODE residual, energy-balance residual, constraint violations, and stability under rollout.
3. **Uncertainty quality:** interval coverage, interval width, calibration error, and selective risk when high-uncertainty samples are rejected.
4. **Closed-loop control:** cooling energy, peak and 95th-percentile temperature, time above safe and critical limits, throttle events, actuator movement, workload performance, and controller latency.

True validation requires comparisons with identical workloads, initial states, horizons, actuator limits, and random seeds. The evaluation includes paired bootstrap confidence intervals or a paired statistical test across scenarios. A single favorable simulation trace is not evidence of superiority.

### 5.3 Generalization tests

The following tests are required before making a cross-domain claim:

- unseen workload pattern;
- sudden burst not present in training;
- unseen (C_i), (K_i), and ambient-temperature ranges;
- sensor noise and missing samples;
- actuator delay and fan saturation;
- GPU-model holdout for real telemetry;
- spatial holdout for a GPU/node or thermal-map region;
- model uncertainty and distribution-shift detection.

Synthetic-to-real validation is reported as transfer evaluation. It is not described as proof that a laptop or desktop GPU represents an H100 or a production rack. Differences in thermal mass, package design, cooling path, sensor position, power envelope, and firmware control are explicit limitations.

### 5.4 Required ablation matrix

The minimum experiment matrix is: PID; heuristic NeuralFlow; data-only LSTM; LSTM plus ODE loss; full LSTM-PINN; independent-node LSTM; GNN without physics; PINN-GNN; and constrained RL on the same simulator. Each method is evaluated with and without uncertainty-aware action intervention where applicable. Energy savings are reported relative to the same baseline and not transferred from unrelated data-center studies.

---

## 6. Results

This section will be filled only from the reproducible experiment artifacts described above. It must include forecast tables by horizon, physics-residual plots, uncertainty calibration plots, OOD results, ablations, and closed-loop controller results with confidence intervals. The existing `metrics.json` is a simulation demonstration and is not sufficient to support real-data, GNN, or RL claims.

---

## 7. Discussion

The central limitation is scope. The current implementation is a single-GPU, lumped-parameter simulation with a heuristic controller. The proposed GNN and RL stages require new data, models, baselines, safety analysis, and experiments. The project will distinguish clearly between simulator validation, telemetry transfer validation, spatial validation, and deployment validation. No autonomous control claim will be made from offline prediction accuracy alone.

---

## 8. Conclusion

*(Write last)*

---

## References

[1] International Energy Agency, "Electricity 2025: Analysis and Forecast to 2027," IEA, Paris, 2025.

[2] D. Chen, C.-K. Chui, and P. S. Lee, "Physics-informed machine learning based predictive control for intelligent operation of edge datacenters," *Applied Energy*, vol. 384, p. 126975, 2025.

[3] *(Add PID cooling lag / thermal throttling citation — search for GPU throttling energy cost paper)*

[4] DeepMind, "DeepMind AI Reduces Google Data Centre Cooling Bill by 40%," DeepMind Blog, 2016. [Online]. Available: https://deepmind.com/blog/article/deepmind-ai-reduces-google-data-centre-cooling-bill-40

[5] *(Add RL-based MPC or cooling paper — Chen or similar)*

[6] *(Add second RL/cooling paper)*

[7] *(Add RL limitations in safety-critical systems paper)*

[8] M. Raissi, P. Perdikaris, and G. E. Karniadakis, "Physics-informed neural networks: A deep learning framework for solving forward and inverse problems involving nonlinear partial differential equations," *Journal of Computational Physics*, vol. 378, pp. 686–707, Feb. 2019.

[9] N. Natale et al., "Physically Consistent Neural Networks for building thermal modelling," *(add full citation)*

[10] G. Cho, D. Zhu, J. J. Campbell, and M. Wang, "An LSTM-PINN Hybrid Method to Estimate Lithium-Ion Battery Pack Temperature," *IEEE Access*, vol. 10, pp. 100594–100604, 2022.

[11] M. Fanoodi, F. Abdollahi, M. A. Shoorehdeli, and M. Maboodi, "PINN vs LSTM: A Comparative Study for Steam Temperature Control in Heat Recovery Steam Generators," arXiv:2512.04183, Dec. 2025.

[12] L. Chen et al., "Fast full-chip parametric thermal analysis based on enhanced physics enforced neural networks," in *Proc. IEEE/ACM ICCAD*, 2023, pp. 1–8.

[13] J. Lu and S. X.-D. Tan, "Thermal Map Dataset for Commercial Multi/Many Core CPU/GPU/TPU," in *Proc. ACM/IEEE MLCAD*, 2024, pp. 1–7. DOI: 10.1145/3670474.3685963.

[14] D. Miao, G. Duan, D. Chen, Y. Zhu, and X. Zheng, "Real-Time Temperature Prediction for Large-Scale Multi-Core Chips Based on Graph Convolutional Neural Networks," *Electronics*, vol. 14, no. 6, p. 1223, Mar. 2025.

[15] *(Authors), "LSTM-PINN for Steady-State Electrothermal Transport: Preserving Multi-Field Consistency in Strongly Coupled Heat and Fluid Flow," arXiv:2604.14201, Apr. 2026.*

[16] *(Authors), "A 20-Year Retrospective on Power and Thermal Modeling and Management," arXiv:2508.05495, 2025.*

[17] *(Add LSTM cooling load prediction IEEE paper — Re-LSTM or similar)*

[18] Alibaba Group, "Alibaba GPU Cluster Trace v2023," GitHub, 2023. [Online]. Available: https://github.com/alibaba/clusterdata

[19] NVIDIA Corporation, "NVIDIA System Management Interface (nvidia-smi)," NVIDIA Developer Documentation, 2024. [Online]. Available: https://developer.nvidia.com/nvidia-smi

[20] J. Lu and S. X.-D. Tan, "Thermal Map Dataset for Commercial Multi/Many Core CPU/GPU/TPU," GitHub, 2024. [Online]. Available: https://github.com/sheldonucr/commercial_thermal_map_dataset. DOI: 10.1145/3670474.3685963.

[21] Standard Performance Evaluation Corporation, "SPEC Power and Performance Benchmark Results," 2024. [Online]. Available: https://www.spec.org/power_ssj2008/results/

[22] Hewlett Packard Enterprise, "SustainCluster: Sustainable Data Center Simulation Environment," GitHub, 2023. [Online]. Available: https://github.com/HewlettPackard/sustain-cluster. arXiv:2306.09053.

[23] Google Inc., "Google Cluster Workload Traces 2011," Google Cloud Storage, 2011. [Online]. Available: https://github.com/google/cluster-data. https://commondatastorage.googleapis.com/clusterdata-2011-2/

[24] W. Wilkes, "Google Cluster Data," Google Research Blog, 2011. [Online]. Available: https://research.google/pubs/pub40578/

[25] N. Lazic et al., "Data Center Cooling using Model-predictive Control," in *Advances in Neural Information Processing Systems*, vol. 31, 2018, pp. 3818–3827. [Online]. Available: https://research.google/pubs/data-center-cooling-using-model-predictive-control/

[26] T. J. Perkins and A. G. Barto, "A Lyapunov-based Approach to Safe Reinforcement Learning," in *Advances in Neural Information Processing Systems*, 2018. [Online]. Available: https://arxiv.org/abs/1805.07708

[27] J. Luo et al., "Controlling Commercial Cooling Systems Using Reinforcement Learning," arXiv:2211.07357, 2022. [Online]. Available: https://arxiv.org/abs/2211.07357

---

> **Writing notes for authors:**
>
> — Every number claimed in the Introduction needs a citation before submission. Mark with *(cite)* as you write.
>
> — Table 1 in Section 2.5 is your paper's most important single figure. Reviewers will look here first to understand novelty. Keep it accurate — only check a box if your experiments actually demonstrate it.
>
> — Sections 4–8 should be started immediately as experiments run, not written retrospectively. Write Section 4 (Methodology) before the code is finished, not after.
>
> — References [3], [5], [6], [7], [9], [17] need full citations filled in — marked with *(add full citation)*. Use Google Scholar to find exact details.
>
> — Dataset section (Section 3) is complete. When writing Section 5 (Experimental Setup), cross-reference dataset subsections (3.1–3.7) rather than re-explaining them.
>
> — Before submission, verify all GitHub links are still live and all arXiv IDs resolve correctly.
