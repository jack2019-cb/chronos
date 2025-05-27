# ChronosCraft AI Project Handover Instructions

## Project Structure Overview

### Branches

- `master`: Main stable branch
- `dev`: Development branch for V0.1
- `feature/calendar-api`: Current feature branch with partial calendar API implementation

## Getting Started

1. **Setup Options**

Option A: Local Development Setup

```bash
# On your local machine, clone the repository
git clone https://github.com/shop-gang/caramel.git
cd caramel

# View all branches
git branch -a

# Switch to development branch
git checkout dev
```

Option B: GitHub Codespaces

1. Go to https://github.com/shop-gang/caramel
2. Click the "Code" button
3. Select "Codespaces" tab
4. Click "Create codespace on main"

5. **Development Environment**

- Project uses VS Code Dev Containers
- Prerequisites:
  - VS Code with Dev Containers extension
  - Docker Desktop running
- Open in VS Code and click "Reopen in Container" when prompted

3. **Current Project State (as of May 26, 2025)**

### Calendar API Feature Status

- Basic implementation in `feature/calendar-api` branch
- Current functionality:
  - Basic GET endpoint returning months data
  - Frontend calendar creator components
  - Initial calendar display grid
  - Basic test coverage

### Pending Implementation

Refer to `NEXT_STEPS.md` for detailed tasks, including:

- Complete calendar API CRUD operations
- PDF export functionality
- External calendar service integration
- Project save/load features
- GenAI integration

## Development Workflow

1. **Starting New Work**

```bash
# Always branch from dev for new features
git checkout dev
git pull origin dev
git checkout -b feature/your-new-feature
```

2. **Regular Development Tasks**

- Run tests: `cd client && npm test` or `cd server && npm test`
- Start frontend: `cd client && npm run dev`
- Start backend: `cd server && npm run dev`

3. **Before Committing**

- Update relevant documentation
- Ensure tests pass
- Follow commit message format:
  - feat: for new features
  - fix: for bug fixes
  - docs: for documentation
  - chore: for maintenance

4. **Merging Process**

- Create PR to merge into `dev`
- Ensure CI passes
- Get code review
- Merge only when approved

## Key Documentation

- `NEXT_STEPS.md`: Current priorities and immediate tasks
- `MVP_CHECKLIST.md`: Progress tracking
- `issues.md`: Known issues and their status
- `CHANGELOG.md`: Recent updates and changes
- `ROADMAP.md`: Long-term project vision

## Project Configuration

- Frontend: Next.js with TypeScript
- Backend: Express (TypeScript migration in progress)
- Testing: Jest
- Linting: ESLint
- Containerization: Dev Containers

## Important Notes

- All sensitive configuration must use GitHub Secrets
- Keep documentation updated as you progress
- Follow the existing code style and patterns
- Use the dev container for consistent development environment

---

_Note: This is a one-time handover document. After reading and saving elsewhere if needed, you can remove this file from the project._
