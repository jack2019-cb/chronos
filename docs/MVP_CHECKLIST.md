# ChronosCraft AI – MVP Development Checklist

## Bootstrapping & Dependency Management

### Frontend

- [ ] Initialize Next.js app with TypeScript in `client/`
- [ ] Add Tailwind CSS or styled-components for styling
- [ ] Set up ESLint, Prettier, Jest, and React Testing Library
- [ ] Use environment variables for API endpoints and keys

### Backend

- [ ] Initialize Node.js/Express app with TypeScript in `server/`
- [ ] Add Prisma ORM for PostgreSQL
- [ ] Use dotenv for local config, environment variables in devcontainer
- [ ] Set up Jest, Supertest, and ESLint

### Shared Code

- [ ] Create a `shared/` package for types/utilities (npm workspaces for v0.1)

---

## MVP Implementation Roadmap

### Phase 1: Foundation

- [ ] Bootstrap both apps with minimal code (hello world endpoints/pages)
- [ ] Set up database connection and migrations (Prisma)
- [ ] Implement basic calendar data models and endpoints
- [ ] Set up PDF export (basic version)
- [ ] Set up GenAI API integration (stub/mock if needed)

### Phase 2: Core Features

- [ ] Build frontend UI for calendar creation and export
- [ ] Implement GenAI-powered image/theme generation
- [ ] Add project save/load functionality
- [ ] Add user authentication (if needed for MVP)

### Phase 3: AI Assistant & Integrations

- [ ] Add conversational AI assistant endpoints and UI
- [ ] Integrate Google Calendar import
- [ ] Enhance GenAI features (icons, palettes, font pairing)

### Phase 4: Polish & Launch

- [ ] Polish, optimize, and prepare for public launch

---

_Check off each item as you complete it to track MVP progress!_

## Estimated Time for Completion

- Directory & Codebase Organization: 1 day
- Initial Implementation Steps: 1 day
- Development Best Practices: 1 day
- Backend MVP: 3–4 days
- Frontend MVP: 3–4 days
- Export & Persistence: 2 days
- Maintenance & Polish: Ongoing

**Total Estimate:** ~10–12 working days for a basic MVP (single developer, focused effort).
