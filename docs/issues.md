# ChronosCraft AI Issues Log

> **Note:** This file is now maintained in `/docs/addenda/issues.md`. For the main project vision, MVP, and actionable tasks, see `ROADMAP.md`, `MVP_CHECKLIST.md`, and `NEXT_STEPS.md` in the docs root.

---

## [2025-05-28] HTTP ERROR 502 on Frontend

- **Description:** When accessing the frontend (e.g., via Codespaces URL), a 502 Bad Gateway error is shown.
- **Context:** This typically means the frontend server is not running, not accessible, or port 3000 is not public in Codespaces.
- **Troubleshooting:**
  - Ensure `client` server is running (`npm run dev` in `client/`)
  - Check Codespaces port forwarding (port 3000 must be public)
  - Review server logs for errors
  - Confirm no port conflicts
- **Status:** Ongoing

## Next.js Development Server Access Issue (2025-05-24)

### 1. Error Description:

502 Bad Gateway error when attempting to access the Next.js development server through GitHub Codespaces URL (sturdy-xylophone-4j64wwj64g95hjwwx-3000.app.github.dev).

### 2. Steps to Reproduce:

1. Start Next.js development server with `cd client && npm run dev`
2. Attempt to access the application through GitHub Codespaces URL
3. Receive 502 Bad Gateway error

### 3. Fix Attempts:

1. Removed Turbopack from dev script in package.json (--turbopack flag was conflicting with Babel configuration)
2. Started server with host flag: `npm run dev -- -H 0.0.0.0`
3. Attempted to make port 3000 public in GitHub Codespaces

### 4. Notes/Context:

#### Resolution Attempts:

- Verified server is running on port 3000
- Confirmed port 3000 is listed in GitHub Codespaces ports
- Modified package.json to use standard Next.js compiler instead of Turbopack
- Server starts successfully but remains inaccessible

#### Key Dependencies:

- Next.js: 15.1.8
- React: ^19.0.0
- Babel configuration is present (babel.config.js)

#### Environment Context:

- GitHub Codespaces development environment
- Port 3000 is currently private
- Using Node.js with npm
- Custom Babel configuration is present

#### Ongoing Investigation:

- Port forwarding configuration in GitHub Codespaces
- Potential conflicts between Babel configuration and Next.js
- Network access permissions in Codespaces environment

#### Related Documentation:

- Next.js [documentation on custom server configuration](https://nextjs.org/docs/advanced-features/custom-server)
- GitHub Codespaces [port forwarding documentation](https://docs.github.com/en/codespaces/developing-in-codespaces/forwarding-ports-in-your-codespace)

### 5. Resolution:

#### A. Test Environment Configuration

1. Removed custom Babel configuration
2. Switched to SWC-based transformation for Jest:
   ```js
   // jest.config.js
   transform: {
     "^.+\\.(t|j)sx?$": ["@swc/jest"],
   }
   ```
3. Added proper Next.js component mocking in `jest.setup.ts`
4. All tests now passing with proper component mocking

#### B. Environment Changes

- Removed: `babel.config.js`
- Added: `jest.setup.ts` with Next.js mocks
- Updated: Jest configuration for SWC compatibility

#### C. Documentation

- Added `BABEL_REMOVAL.md` explaining changes
- Updated relevant configuration files
- All changes documented in Git history

#### D. Verification Steps

1. ✅ All frontend tests passing
2. ✅ Next.js dev server properly configured
3. ✅ Component mocking working as expected

#### E. Frontend UI Fixes (2025-05-25)

1. Removed empty `babel.config.js`
2. Updated `next.config.ts`:
   - Configured image optimization
   - Enabled React strict mode
   - Removed invalid server configurations
3. Development server now starts with:
   ```bash
   npm run dev -- -H 0.0.0.0
   ```
4. Port 3000 made public in Codespaces:
   ```bash
   gh codespace ports visibility 3000:public
   ```

#### F. Access Instructions

1. Start server with host flag: `npm run dev -- -H 0.0.0.0`
2. Ensure port 3000 is public in Codespaces
3. Access via Codespaces URL (e.g., sturdy-xylophone-4j64wwj64g95hjwwx-3000.app.github.dev)

For detailed configuration notes, see:

- `client/next.config.ts`
- `client/BABEL_REMOVAL.md`

## Calendar API Implementation Status (2025-05-26)

### 1. Current Implementation:

- Basic GET endpoint returning months array
- Frontend components for calendar display
- Basic test coverage

### 2. Pending Implementation:

- Full CRUD operations for calendar events
- Data models and persistence
- Integration with external calendar services
- PDF export functionality
- Project save/load functionality
- GenAI integration for themes/styling

### 3. Technical Debt:

- TypeScript migration for backend endpoints (core server and routes migrated as of 2025-05-28; review other modules ongoing)
- Review and expand test coverage for all modules (in progress)
- Audit and update documentation for all APIs and modules (in progress)

> **Note (2025-05-28):**
> Backend server entrypoint and routes (index, users, app, www) migrated to TypeScript. Calendar API and main server logic now TypeScript-based. Reviewing other modules for further migration and coverage.

## Server Startup Issue (2025-05-27)

### 1. Error Description:

Backend server fails to start with MODULE_NOT_FOUND error when attempting to run with `ts-node ./bin/www` or `npm run dev`.

### 2. Steps to Reproduce:

1. Navigate to server directory
2. Run `npm run dev` or `npx ts-node ./bin/www`
3. Receive error: "Cannot find module './www'"

### 3. Current Status:

- Issue identified and documented
- Temporary workaround: Use frontend independently while backend fix is pending
- To be resolved in next development session

### 4. Notes/Context:

- Error suggests possible path resolution issue with ts-node and project structure
- May be related to the nested server directory structure
- Priority: High (blocks backend development and testing)

## Calendar Month Selection UI Issue (2025-05-27)

### 1. Error Description:

When attempting to select multiple months in the calendar creation interface, only January remains selected regardless of other month selections.

### 2. Steps to Reproduce:

1. Access the calendar creation interface
2. Attempt to select multiple months
3. Observe that only January remains selected, while other month selections are not persisted

### 3. Current Status:

- Issue identified during frontend testing
- Affects the month selection functionality in CalendarCreator component
- Priority: High (impacts core calendar creation functionality)

### 4. Notes/Context:

- Likely related to state management in the CalendarCreator component
- May indicate issues with the month selection state persistence
- To be investigated in the frontend components, particularly CalendarCreator.tsx

---

# Priority Issue: Dependency and Security Warnings

- The project has had several deprecated and vulnerable dependencies, as reported by npm install and npm audit.
- These issues were resolved by running `npm audit fix --force`, which updated some packages (including next) outside the original version range.
- **Priority:** Regularly review and update dependencies. Monitor for breaking changes after forced updates. Document and address any compatibility issues that arise from these updates.
- **Action:** Add dependency and security review to the regular maintenance checklist.

---
