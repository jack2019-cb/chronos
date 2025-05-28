#!/bin/bash
# start-dev.sh: Start backend and frontend, then run Playwright integration tests

# Exit on error
set -e

# Kill any process on ports 3000 and 5000
fuser -k 3000/tcp || true
fuser -k 5000/tcp || true

# Start backend
(cd server && npm run dev &)
BACKEND_PID=$!

# Wait for backend to be ready
until nc -z localhost 5000; do
  echo "Waiting for backend on 5000..."
  sleep 1
done

# Start frontend
(cd client && npm run dev &)
FRONTEND_PID=$!

# Wait for frontend to be ready
until nc -z localhost 3000; do
  echo "Waiting for frontend on 3000..."
  sleep 1
done

# Run Playwright integration tests (Chromium only to avoid missing deps)
(cd client && npx playwright test --project=chromium)

# Kill servers after tests
kill $BACKEND_PID $FRONTEND_PID
