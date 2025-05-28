#!/bin/bash
# start-dev.sh: Start backend and frontend, then run Playwright integration tests

# Exit on error
set -e

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -i :"$port" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to wait for service
wait_for_service() {
    local port=$1
    local name=$2
    local max_attempts=30
    local attempt=1

    echo "Waiting for $name to be ready on port $port..."
    while [ $attempt -le $max_attempts ]; do
        if check_port "$port"; then
            echo "$name is ready on port $port!"
            return 0
        fi
        echo "Attempt $attempt/$max_attempts: $name not ready yet..."
        sleep 2
        ((attempt++))
    done
    echo "Timeout waiting for $name to start"
    return 1
}

echo "Ensuring ports are free..."
fuser -k 3000/tcp >/dev/null 2>&1 || true
fuser -k 5000/tcp >/dev/null 2>&1 || true
sleep 2

echo "Starting backend server..."
(cd server && DEBUG=server:* npm run dev) &
BACKEND_PID=$!

# Wait for backend
wait_for_service 5000 "Backend" || { kill $BACKEND_PID; exit 1; }

echo "Starting frontend..."
(cd client && npm run dev) &
FRONTEND_PID=$!

# Wait for frontend
wait_for_service 3000 "Frontend" || { kill $BACKEND_PID $FRONTEND_PID; exit 1; }

echo "Both services are running. Starting Playwright tests..."
(cd client && npx playwright test --project=chromium)
TEST_EXIT_CODE=$?

echo "Tests completed with exit code $TEST_EXIT_CODE"
echo "Shutting down servers..."
kill $BACKEND_PID $FRONTEND_PID || true
wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true

exit $TEST_EXIT_CODE
