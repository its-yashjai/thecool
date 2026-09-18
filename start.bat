@echo off
echo Starting NeuralFlow...
start "NeuralFlow WS Server" cmd /k ".\neuralflow_env\Scripts\python.exe realtime_server.py"
timeout /t 2 /nobreak >nul
start "NeuralFlow Dashboard" cmd /k ".\neuralflow_env\Scripts\python.exe -m streamlit run dashboard.py"
echo Both servers started. Opening browser...
timeout /t 3 /nobreak >nul
start http://localhost:8501
