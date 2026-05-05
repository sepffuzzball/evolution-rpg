# Agent Decision Log

## 2026-05-02: Use a local-first React single-page app

- Context: The repository contained only RPG Markdown rule documents and no existing application stack. The user asked for a web application with persistent character data and support for multiple people.
- Decision: Build a React/TypeScript/Vite single-page application with browser `localStorage` persistence and JSON import/export.
- Alternatives considered: Server-backed app with database and authentication; plain static HTML/CSS/JavaScript.
- Consequences: The app is fast to run and deploy as static assets, but shared multi-device persistence requires exporting/importing JSON or a future backend.
- Related files/tasks: `src/`, `package.json`, `docs/architecture.md`, TASK-001.

## 2026-05-02: Containerize as static assets behind unprivileged Nginx

- Context: The application is a static Vite build and needs a production-oriented Dockerfile.
- Decision: Use a Node build stage and `nginxinc/nginx-unprivileged:stable-alpine` runtime on port 8080.
- Alternatives considered: Node preview server in production; rootful Nginx image.
- Consequences: The image is small, does not run as root, and needs no application server until persistence moves server-side.
- Related files/tasks: `Dockerfile`, `.dockerignore`, `.github/workflows/docker-image.yml`.

## 2026-05-04: Move ledger persistence behind a Node API

- Context: The app needs shared data visible to multiple people and must stop storing application data in the browser.
- Decision: Serve the built React app and `/api/state` from a small Node HTTP server. Store the whole ledger through a persistence adapter with PostgreSQL JSONB for production and file/memory adapters for local development and tests.
- Alternatives considered: Entity-by-entity REST API and ORM-backed relational schema; continuing local-first storage with sync/import workflows.
- Consequences: The implementation is simple and database-backed without production sample seeding, but concurrent edits are currently last-write-wins and authentication remains future work.
- Related files/tasks: `server/index.js`, `server/storage.js`, `src/storage.ts`, `Dockerfile`, TASK-002.

## 2026-05-04: Store rarity definitions in the shared ledger

- Context: Rarities were hard-coded in TypeScript constants, which made adding Mythical, Divine, or table-specific rarities require code changes.
- Decision: Add `rarityDefinitions` to `AppState` with name, multiplier, and color, seed defaults from Common through Divine, and use those definitions for progression and item calculations.
- Alternatives considered: Keep a larger hard-coded rarity enum; add a separate relational rarity table outside the ledger JSON.
- Consequences: Tables can edit rarities through the Compendium and exports/imports carry rarity balance with the ledger. Existing ledgers receive default rarity definitions during sanitization.
- Related files/tasks: `src/types.ts`, `src/data.ts`, `src/storage.ts`, `src/App.tsx`, TASK-003.

## 2026-05-04: Store character type multipliers in the shared ledger

- Context: Race growth used a hard-coded character type multiplier, making Humanoid/Half-monster/Monster balance changes require code edits.
- Decision: Add `characterTypeDefinitions` to `AppState` with fixed character kind, display label, and multiplier, then use those definitions in race level-up calculations.
- Alternatives considered: Keep the hard-coded switch; create fully user-defined character kinds.
- Consequences: Tables can rebalance character type growth from the Compendium while preserving the fixed character-kind behavior used by progression rules.
- Related files/tasks: `src/types.ts`, `src/data.ts`, `src/storage.ts`, `src/App.tsx`, TASK-004.
