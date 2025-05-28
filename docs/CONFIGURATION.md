# ChronosCraft AI Configuration Guide

## Port Configuration

| Service  | Port | Description                | Environment Variable |
| -------- | ---- | -------------------------- | -------------------- |
| Frontend | 3000 | Next.js development server | `PORT` (optional)    |
| Backend  | 5000 | Express API server         | `PORT` (optional)    |
| Database | 5432 | PostgreSQL database        | See Database Config  |

### Port Configuration Details

- All ports are configured in `.devcontainer/devcontainer.json`
- Ports are automatically forwarded in GitHub Codespaces
- Each service has proper port isolation and labeling

## Environment Variables

### Database Configuration

```env
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
POSTGRES_DB=chronocraft
POSTGRES_USER=vscode
POSTGRES_PASSWORD=password  # Change in production
```

### API Keys

```env
GEMINI_API_KEY=your_key_here  # Required for GenAI features
```

## Service Configuration

### Frontend (Next.js)

- Configuration file: `client/next.config.ts`
- Environment setup: `client/.env.local`
- Development command: `npm run dev`

### Backend (Express)

- Configuration file: `server/bin/www.ts`
- Environment setup: `server/.env`
- Development command: `npm run dev`
- Default port: 5000 (configurable via PORT environment variable)

### Database (PostgreSQL)

- Configuration in `.devcontainer/docker-compose.yml`
- Persisted via Docker volume: `postgres_data`
- Available on localhost:5432 within the dev container

## Development Environment

### VS Code Dev Container

- Full configuration in `.devcontainer/`
- Includes all necessary extensions and tools
- Automatic port forwarding and environment setup

### GitHub Codespaces

- Identical configuration to local dev container
- Automatic port forwarding and HTTPS URLs
- Environment variables should be set in Codespace Secrets

## Common Setup Issues

1. **Port Conflicts**

   - Solution: Check for processes using ports 3000, 5000, or 5432
   - Alternative ports can be set via environment variables

2. **Database Connection**

   - Ensure DATABASE_URL matches PostgreSQL configuration
   - Check if database service is running (`docker ps`)

3. **Environment Variables**
   - Copy `.env.example` to `.env` in both client and server
   - Set up all required API keys
   - Configure database credentials

## Additional Resources

- See `docs/API.md` for API documentation
- See `docs/CONTRIBUTING.md` for development workflow
- See `docs/CHANGELOG.md` for version history
