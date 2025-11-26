#!/bin/bash

# WanderMage Start Script
# Starts both backend and frontend in separate processes

echo "Starting WanderMage..."

# Check if backend .env exists
if [ ! -f "backend/.env" ]; then
    echo "Error: backend/.env not found!"
    echo "Please run ./setup.sh first"
    exit 1
fi

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "Shutting down WanderMage..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend
echo "Starting backend server..."
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

sleep 3

# Start frontend
echo "Starting frontend server..."
cd web-client
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo ""
echo "======================================"
echo "  WanderMage is running! (Dev Mode)"
echo "======================================"
echo ""
echo "Development URLs:"
echo "  Frontend: http://localhost:3000"
echo "  Backend API: http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "For production deployment with https://wandermage.localhost,"
echo "run: sudo ./scripts/deploy.sh"
echo ""
echo "Logs:"
echo "  Backend: tail -f backend.log"
echo "  Frontend: tail -f frontend.log"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for user interrupt
wait
