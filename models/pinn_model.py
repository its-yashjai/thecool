import torch
import torch.nn as nn
import torch.nn.functional as F

class PINNModel(nn.Module):
    def __init__(self, input_size=5, hidden_size=64, num_layers=2, dropout=0.1):
        super(PINNModel, self).__init__()
        self.lstm = nn.LSTM(
            input_size=input_size, 
            hidden_size=hidden_size, 
            num_layers=num_layers, 
            batch_first=True, 
            dropout=dropout
        )
        self.fc1 = nn.Linear(hidden_size, 32)
        # Using dropout here to enable MC Dropout uncertainty estimation
        self.dropout = nn.Dropout(p=dropout)
        self.fc2 = nn.Linear(32, 3)

    def forward(self, x):
        # x shape: (batch, seq_len, features)
        out, (hn, cn) = self.lstm(x)
        # Take the output of the last time step
        out = out[:, -1, :]
        out = F.relu(self.fc1(out))
        out = self.dropout(out)
        out = self.fc2(out)
        return out

def pinn_loss(pred, actual, T, P, fan, k=0.05, C=500, T_amb=25.0, dt=15.0):
    # L_data: Mean Squared Error of the predictions vs actual future temps
    L_data = F.mse_loss(pred, actual)
    
    # Physics calculations
    # pred is shape (batch, 3) for T+30, T+45, T+60
    # To compute dT/dt, we take the derivative between predictions.
    # We'll use the interval from T+30 to T+45 as a representative physics step
    # dt is 15 seconds here
    dT_pred = (pred[:, 1] - pred[:, 0]) / dt
    
    # P, T, fan are the latest known values (at time T=0 relative to prediction)
    # k_effective calculation
    k_effective = k * (0.5 + fan / 100.0)
    
    # heat equation: dT/dt = P/C - k*(T - T_amb)
    dT_physics = (P / C) - k_effective * (T - T_amb)
    
    L_physics = F.mse_loss(dT_pred, dT_physics)
    
    # Energy balance: P = C*dT/dt + k*C*(T - T_amb)
    L_energy = F.mse_loss(P, C * dT_pred + k_effective * C * (T - T_amb))
    
    return L_data + 0.1 * L_physics + 0.05 * L_energy

def predict_with_uncertainty(model, x, n_samples=50):
    """
    MC Dropout prediction to get uncertainty bands.
    Model must have dropout layers that remain active during inference.
    """
    model.train() # Keep dropout active
    with torch.no_grad():
        preds = torch.stack([model(x) for _ in range(n_samples)])
    
    mean_pred = preds.mean(0)
    std_pred = preds.std(0)
    
    return mean_pred, std_pred
