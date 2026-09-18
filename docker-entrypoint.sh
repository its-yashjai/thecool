#!/bin/bash
set -e

# Start FastAPI WebSocket server in background
python realtime_server.py &
WS_PID=$!

# Give it a moment to start
sleep 2

# Start Streamlit dashboard (foreground)
exec streamlit run dashboard.py \
    --server.address=0.0.0.0 \
    --server.port=8501 \
    --server.headless=true

# Cleanup on exit
trap "kill $WS_PID" EXIT