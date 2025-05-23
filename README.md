# caramel
Home to ChronosCraft AI

## ChronosCraft AI

Fluid and magic-like crafting of stunningly unique, personalized, printable calendars using Generative AI.


## Overview

ChronosCraft AI is a web application where users co-create beautiful, personalized, printable calendars with the help of Generative AI. The project is split into two main parts:

- [`client/`](./client): Frontend (React/Next.js) – user experience, design, and GenAI-powered creative features.
- [`server/`](./server): Backend (Node.js/Express) – API orchestration, persistence, and integration with AI services.

For detailed technical and product documentation, see the respective `README.md` files in each subdirectory.

> **Directory Structure**
>
> - `.devcontainer/` – Only for dev environment setup
> - `client/` – See above
> - `docs/` – For all product, technical, and process documentation
> - `infra/` – For infrastructure-as-code (IaC) or deployment configs
> - `scripts/` – For automation scripts (setup, lint, test, deploy, etc.)
> - `server/` – See above


## Technology Vibe

- **Frontend:** Modern, component-based JS framework (React/Next.js). Focus on a clean, responsive UI.
- **Backend:** Scalable platform (Node.js/Express). Ready to orchestrate multiple API calls.
- **Database:** For a balance of structure and flexibility (PostgreSQL/JSONB).
- **AI:** 
  - **Default:** Use Google's Gemini for both text and image generation.
  - Leverage best-in-class third-party APIs for core GenAI (image generation, possibly LLM for assistant). Build custom logic for agent orchestration and workflow, not foundational models.
  - Optionally support use of [GitHub Models](https://github.com/features/models) to find and experiment with AI models for free.
- **PDF Generation:** Use a proven, robust library (implementing both, but for v0.1 the focus is on pdf-lib; puppeteer for HTML-to-PDF is to be an addition for V1.0 -- make it work).
- **Persistence:** Standard database for user accounts, projects, preferences, asset metadata.


## Secrets & Sensitive Data

- All sensitive configuration (API keys, credentials, etc.) must be managed using [GitHub Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets) only. Do not commit secrets to the repository or use alternative secret management systems.


## Quick Start

This project is designed for development in a containerized environment (see Dev Containers).

1. Open in VS Code with the Dev Containers extension.
2. See [`client/README.md`](./client/README.md) and [`server/README.md`](./server/README.md) for setup and contribution details.

---
*For the full product vision and feature breakdown, see the documentation in each subproject.*
