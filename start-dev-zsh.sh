#!/usr/bin/env zsh
# start-dev-zsh.sh: Start backend and frontend, then run Playwright integration tests (zsh compatible)

set -e

# Check for required dependencies and commands
REQUIRED_CMDS=(lsof fuser curl npm npx)
for dep in $REQUIRED_CMDS; do
  if ! command -v $dep >/dev/null 2>&1; then
    echo "Error: Missing required command: $dep"
    exit 1
  fi
done

# Check for ts-node in server (for backend)
if ! (cd server && npx --no-install ts-node --version >/dev/null 2>&1); then
  echo "Error: ts-node is not installed in ./server."
  echo "Please run: cd server && npm install --save-dev ts-node"
  exit 1
fi

# Function to check if a port is in use (for backend)
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to check if a service is ready (HTTP check for frontend)
check_http() {
    local url=$1
    if curl -s --head --request GET "$url" | grep "200 OK" > /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to wait for service (port or HTTP)
wait_for_service() {
    local port=$1
    local name=$2
    local max_attempts=30
    local attempt=1
    local url=$3

    echo "Waiting for $name to be ready on port $port..."
    while [[ $attempt -le $max_attempts ]]; do
        if [[ -n "$url" ]]; then
            if check_http "$url"; then
                echo "$name is ready on $url!"
                return 0
            fi
        else
            if check_port "$port"; then
                echo "$name is ready on port $port!"
                return 0
            fi
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

# Wait for frontend (use HTTP check)
wait_for_service 3000 "Frontend" "http://localhost:3000" || { kill $BACKEND_PID $FRONTEND_PID; exit 1; }

echo "Both services are running. Starting Playwright tests..."
(cd client && npx playwright test --project=chromium)
TEST_EXIT_CODE=$?

echo "Tests completed with exit code $TEST_EXIT_CODE"
echo "Shutting down servers..."
kill $BACKEND_PID $FRONTEND_PID || true
wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true

exit $TEST_EXIT_CODE
