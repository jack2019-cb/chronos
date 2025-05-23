# ChronosCraft AI – Server (Backend)

> **Directory Structure**
>
> - `__tests__` – Tests for all critical logic
> - `controllers/` – Request handlers and business logic
> - `models/` – Database models and schemas
> - `routes/` – Express route definitions
> - `services/` – Service layer for business logic and integrations
> - `utils/` – Utility functions

## Backend Vision & Role

- **Project Goal:** Orchestrate a magical, effortless experience for crafting stunningly unique, personalized, printable calendars using AI.
- **Core Purpose:** Provide a scalable, reliable backend to support AI-powered calendar generation, user/project persistence, and high-quality export.

## Core Epics & Feature Vibes (Backend)

**(Epic 1)** Calendar Foundation Vibe - "Solid & Dependable":

- API endpoints for calendar data (year/month, layouts, holidays, events).
- Data validation and normalization.

**(Epic 2)** GenAI Magic Vibe - "Inspiring & Wow!":

- Integrate with third-party GenAI APIs for image and theme generation.
- Orchestrate AI suggestions for themes, palettes, fonts.
- Serve generated assets to frontend.

**(Epic 3)** AI Assistant Vibe - "Helpful & Intuitive":

- Natural language processing endpoints for design assistant features.
- Google Calendar integration for event import.
- Conversational refinement endpoints.

**(Epic 4)** Output & Persistence Vibe - "Tangible & Useful":

- PDF/PNG export endpoints (vector, print-ready).
- Project save/load endpoints.
- User authentication and project metadata storage.

## Guiding Principles (Backend)

- **Simplicity & Flow:** API should be intuitive and easy to consume.
- **Scalability:** Ready to orchestrate multiple API calls and scale as needed.
- **Quality Output:** Ensure exports are high-fidelity and reliable.
- **Security:** Protect user data and API keys.

## Technology Vibe (Backend)

- **Backend:** Node.js/Express.
- **Persistence:** Standard database for user accounts, projects, preferences, asset metadata.
- **Generative AI:** Integrate with third-party APIs (not building foundational models).

## Out of Scope (Backend)

- Building foundational AI models in-house.
- Integration with all calendar providers (start with Google).
- Advanced, granular layout customization tools.
- Direct e-commerce integration.
