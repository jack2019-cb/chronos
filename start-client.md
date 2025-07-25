# Start GUI Reliably

## Current Simple Version

```bash
#!/bin/bash
(cd server && npm run dev) &
(cd client && npm run dev)
```

## Issue

Simple version works but requires multiple restarts to get a functional GUI.

## Requirements

1. Start both services
2. Must work reliably first time
3. Keep it simple - no complex validation

## Proposed Solution

```bash
#!/bin/bash
echo "Starting services..."
(cd server && npm run dev) &
sleep 3  # Give backend a head start
(cd client && npm run dev)
```

- Backend starts first
- Small delay ensures backend initialization
- Frontend in foreground shows Next.js status
- No fancy checks, just reliable startup
