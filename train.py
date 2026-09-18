import os
import torch
import numpy as np
import pandas as pd
from torch.utils.data import TensorDataset, DataLoader
from tqdm import tqdm
from rich.console import Console

import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from models.pinn_model import PINNModel, pinn_loss

console = Console()

def create_dataset(df, window_size=30, horizon=[30, 45, 60]):
    X, Y, physics_vars = [], [], []
    
    # Process each scenario separately
    for scenario_id, group in df.groupby('scenario_id'):
        group = group.reset_index(drop=True)
        # Features: temp, power, fan_speed, ambient_temp, rolling_power
        features = group[['temperature', 'power_draw', 'fan_speed', 'ambient_temp', 'rolling_power']].values
        
        # Max index we can start a window at
        max_start = len(group) - window_size - max(horizon)
        
        for i in range(max_start):
            window = features[i:i+window_size]
            
            # The current state is the last step of the window
            current_idx = i + window_size - 1
            
            # Targets
            y_t30 = group.loc[current_idx + horizon[0], 'temperature']
            y_t45 = group.loc[current_idx + horizon[1], 'temperature']
            y_t60 = group.loc[current_idx + horizon[2], 'temperature']
            
            # Physics variables at current_idx for loss calculation
            # P, T, fan
            curr_P = group.loc[current_idx, 'power_draw']
            curr_T = group.loc[current_idx, 'temperature']
            curr_fan = group.loc[current_idx, 'fan_speed']
            
            X.append(window)
            Y.append([y_t30, y_t45, y_t60])
            physics_vars.append([curr_P, curr_T, curr_fan])
            
    return np.array(X), np.array(Y), np.array(physics_vars)

def train_model():
    console.print("[bold green]Loading data...[/bold green]")
    data_path = os.path.join('data', 'synthetic_data.csv')
    if not os.path.exists(data_path):
        console.print("[bold red]Dataset not found. Please run data/generate_dataset.py first.[/bold red]")
        return
        
    df = pd.read_csv(data_path)
    
    # Scale features optionally, but physics loss expects raw values for T, P, etc.
    # To keep it simple and accurate to physics, we'll feed raw values, 
    # but neural networks prefer scaled inputs. 
    # For this demo, let's stick to raw or minimally scaled, or ensure the physics loss accounts for scaling.
    # Let's use raw since PRD equations assume raw units.
    
    X, Y, P_vars = create_dataset(df)
    
    tensor_X = torch.FloatTensor(X)
    tensor_Y = torch.FloatTensor(Y)
    tensor_P_vars = torch.FloatTensor(P_vars) # [P, T, fan]
    
    dataset = TensorDataset(tensor_X, tensor_Y, tensor_P_vars)
    # Split 80/20
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_dataset, val_dataset = torch.utils.data.random_split(dataset, [train_size, val_size])
    
    train_loader = DataLoader(train_dataset, batch_size=256, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=256)
    
    model = PINNModel(input_size=5, hidden_size=64, num_layers=2)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    
    epochs = 5
    console.print(f"[bold cyan]Starting training for {epochs} epochs...[/bold cyan]")
    
    for epoch in range(epochs):
        model.train()
        total_loss = 0
        
        with tqdm(train_loader, desc=f"Epoch {epoch+1}/{epochs}") as pbar:
            for batch_x, batch_y, batch_p in pbar:
                optimizer.zero_grad()
                
                pred_y = model(batch_x)
                
                # Extract physics vars
                P = batch_p[:, 0]
                T = batch_p[:, 1]
                fan = batch_p[:, 2]
                
                loss = pinn_loss(pred_y, batch_y, T, P, fan)
                loss.backward()
                optimizer.step()
                
                total_loss += loss.item()
                pbar.set_postfix({'loss': f"{loss.item():.4f}"})
                
        # Validation
        model.eval()
        val_loss = 0
        with torch.no_grad():
            for batch_x, batch_y, batch_p in val_loader:
                pred_y = model(batch_x)
                P = batch_p[:, 0]
                T = batch_p[:, 1]
                fan = batch_p[:, 2]
                loss = pinn_loss(pred_y, batch_y, T, P, fan)
                val_loss += loss.item()
                
        val_loss /= len(val_loader)
        console.print(f"Epoch {epoch+1} - Val Loss: {val_loss:.4f}")
        
    os.makedirs('models', exist_ok=True)
    save_path = os.path.join('models', 'trained_pinn.pt')
    torch.save(model.state_dict(), save_path)
    console.print(f"[bold green]Model saved to {save_path}[/bold green]")

if __name__ == '__main__':
    train_model()
