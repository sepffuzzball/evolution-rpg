# Agent Task Board

## Backlog

## Ready

## In Progress

## Review

## Blocked

## Done

### TASK-011: Enforce creator item skill slots and race notices

- Status: Done
- Priority: P1
- Owner/agent: orchestrator with explorer support
- Links: `src/App.tsx`
- Acceptance criteria:
  - Character creation item skill toggles cannot set more item skills than the character's current tier.
  - Existing item skill limit enforcement handles multi-skill items using `setSkillNames`.
  - Humanoid class/job level-ups enqueue a race level-up popup when the derived race average also increases.
  - Race level-up popup is read after the class/job popup.
- Notes/progress: Added shared item skill counting, creator-side item skill slot disabling/enforcement, multi-skill-aware limit trimming, queued level-up notices, and humanoid race notices after class/job level-up notices. Validation remains blocked by missing TypeScript language server and Windows npm resolving through `cmd.exe` from the WSL UNC path.

### TASK-010: Correct sheet totals and item skill access

- Status: Done
- Priority: P1
- Owner/agent: orchestrator with explorer support
- Links: `src/App.tsx`, `src/styles.css`
- Acceptance criteria:
  - Character totals and stat breakdowns no longer add/display base stats.
  - Sheet stat parentheticals show equipment bonus only.
  - Set item skills appear in the character sheet skill lists.
  - Character sheet supports quick searching and adding items from the item compendium.
- Notes/progress: Removed `character.baseStats` from `calculateTotals`, removed the Base stats row from breakdown popups, simplified stat parentheticals to `+eq`, derived set item skills into Active/Passive skill lists, and added a quick item search/add panel above sheet items. Validation remains blocked by missing TypeScript/CSS language servers and Windows npm resolving through `cmd.exe` from the WSL UNC path.

### TASK-009: Keep selection hover cards above all content

- Status: Done
- Priority: P2
- Owner/agent: orchestrator with explorer support
- Links: `src/App.tsx`, `src/styles.css`
- Acceptance criteria:
  - Race/class/job and skill hover cards render above all app panels and scroll containers.
  - Hover cards appear faster than the previous two-second delay.
  - Skill hover cards show MP Cost, Cooldown, and Casting Time.
- Notes/progress: Moved skill and definition hover cards into `document.body` via React portals with fixed viewport positioning and maximum z-index, reduced hover delay to 450ms, and added skill timing/cost metadata. Validation remains blocked by missing TypeScript/CSS language servers and Windows npm resolving through `cmd.exe` from the WSL UNC path.

### TASK-008: Unify sheet calculation popups and hover cards

- Status: Done
- Priority: P2
- Owner/agent: orchestrator with explorer support
- Links: `src/App.tsx`, `src/styles.css`
- Acceptance criteria:
  - Stat breakdown popups stack above lower character sheet panels.
  - HP and MP show calculation popups with the same visual style as stat breakdowns.
  - Race/class/job and skill selection hover cards reuse the calculation popup treatment.
- Notes/progress: Added sheet panel z-index/isolation layering, HP/MP focusable breakdown rows, shared `.calculation-popover` styling, and focus support for skill/definition hover cards. Validation remains blocked by missing TypeScript/CSS language servers and Windows npm resolving through `cmd.exe` from the WSL UNC path.

### TASK-007: Add stat calculation hover breakdowns

- Status: Done
- Priority: P2
- Owner/agent: orchestrator with designer support
- Links: `src/App.tsx`, `src/styles.css`
- Acceptance criteria:
  - Hovering or focusing a character sheet stat shows a calculation popup.
  - Popup breaks the selected stat down by tier rows and tier bonus/race/class/job/items columns.
  - Popup includes passive bonuses, tier-derived total, and calculated total.
- Notes/progress: Added stat breakdown helpers, per-stat focusable hover popovers, and table styling. Also removed duplicate legacy `raceBonuses` contribution from total calculation so displayed totals align with the formula-backed breakdown. Validation remains blocked by missing TypeScript/CSS language servers and missing Linux Node.js/tsc in this environment.

### TASK-006: Make tiers database-backed with static bonuses

- Status: Done
- Priority: P1
- Owner/agent: orchestrator with explorer support
- Links: `src/types.ts`, `src/data.ts`, `src/storage.ts`, `src/App.tsx`, `README.md`, `StatSheet.md`, `Tiers.md`, `docs/architecture.md`
- Acceptance criteria:
  - Tier definitions are stored in shared state with number, title, details, max level, race/class/job/item multipliers, and static tier bonus.
  - Default tier multipliers preserve race/class/job `Tier * 20`, item `Tier * 10`, and static tier bonus `Tier * 10`.
  - Growth, item bonuses, max-level UI, creation, review, and path rendering read tier definitions dynamically.
  - Static tier bonuses are included in sheet totals and shown in creation/path tier summaries.
  - Compendium exposes a Tiers editor and supports additional tiers.
- Notes/progress: Added `tierDefinitions` to `AppState`, sanitization, default seed data, Tiers compendium tab, dynamic max-level/tier-bound handling, tier multiplier formula wiring, and cumulative static tier bonuses. Validation remains blocked by missing TypeScript language server and missing Linux Node.js/tsc in this environment.

### TASK-005: Update stat point formulas

- Status: Done
- Priority: P1
- Owner/agent: orchestrator
- Links: `src/App.tsx`, `StatSheet.md`, `README.md`, `Races.md`, `Classes.md`, `Jobs.md`
- Acceptance criteria:
  - Race level-up points use `Character Type Multiplier * (Tier * 2) * 10 * Rarity Multiplier`.
  - Class and Job level-up points use `(Tier * 2) * 10 * Rarity Multiplier`.
  - Item stat points use `Tier * 10 * Rarity Multiplier`.
  - Race/Class/Job level-up calculations use the tier record where the track is assigned, not the template minimum tier or latest character tier.
  - Create/Edit progression previews and review path show the same formula-backed totals as the sheet.
  - StatSheet and related docs describe the updated formulas.
- Notes/progress: Updated progression and item formulas plus formula documentation. Corrected progression recalculation to pass each `tierData.tier` into race/class/job level-up point calculations. Replaced stale create/review preview math (`level * statWeight`) with the shared formula helpers and made each track level count as one full point pool, including level 1. Validation remains blocked by missing TypeScript language server and missing Linux Node.js/tsc in this environment.

### TASK-004: Make character type multipliers database-backed

- Status: Done
- Priority: P1
- Owner/agent: orchestrator with explorer support
- Links: `src/types.ts`, `src/data.ts`, `src/storage.ts`, `src/App.tsx`, `README.md`, `Races.md`
- Acceptance criteria:
  - Character type multipliers are stored in shared state.
  - Humanoid, Half-monster, and Monster defaults use multipliers 1, 2, and 3.
  - Race growth formulas read character type multipliers dynamically.
  - Compendium exposes an editor for character type labels and multipliers.
- Notes/progress: Added `characterTypeDefinitions` to `AppState`, seeded defaults, added a Types compendium tab, and wired race growth/recalculation to dynamic character type multipliers. Validation remains blocked by missing Linux Node.js in this environment.

### TASK-003: Make rarities database-backed and extensible

- Status: Done
- Priority: P1
- Owner/agent: orchestrator with explorer support
- Links: `src/types.ts`, `src/data.ts`, `src/storage.ts`, `src/App.tsx`, `src/styles.css`, `README.md`, `Rarities.md`
- Acceptance criteria:
  - Rarity definitions are stored in shared state with name, multiplier, and color.
  - Mythical and Divine defaults are available with requested multipliers and colors.
  - Growth and item stat formulas read rarity multipliers dynamically.
  - Compendium can add and edit rarity definitions.
- Notes/progress: Added `rarityDefinitions` to `AppState`, seeded Common through Divine defaults, added a Rarities compendium tab, and wired dynamic rarity multipliers into progression/item calculations. Build validation is blocked because this environment has no Linux `node` binary and the available Windows npm cannot run from the WSL path.

### TASK-002: Add shared database-backed persistence

- Status: Done
- Priority: P0
- Owner/agent: orchestrator with explorer/librarian/fixer/oracle support
- Links: `src/storage.ts`, `src/App.tsx`, `server/`, `Dockerfile`, `.env.example`, `docs/architecture.md`
- Acceptance criteria:
  - Browser storage is no longer used for application data.
  - A server API persists the shared ledger for all users.
  - PostgreSQL is supported for production persistence.
  - Non-production mock/file-backed storage is available for testing and local workflows.
  - Empty production databases are not seeded with sample data.
- Notes/progress: Implemented Node `/api/state`, PostgreSQL JSONB/file/memory adapters, revision conflict checks, tests, Docker runtime update, config/docs updates. Validated with direct TypeScript compiler, storage tests, and server syntax check; Vite build is blocked by the local Windows npm/WSL optional Rollup dependency issue noted in `.agent/NOTES.md`.

### TASK-001: Create initial Evolution RPG web app

- Status: Done
- Priority: P0
- Owner/agent: orchestrator with explorer/designer support
- Links: `src/`, `README.md`, `docs/architecture.md`
- Acceptance criteria:
  - Read top-level RPG Markdown files.
  - Create a web app for multi-player character creation and sheet tracking.
  - Support humanoid, monster, and half-monster progression differences.
  - Persist character data and show a visual System path.
  - Add baseline project docs, Docker, and workflow metadata.
- Notes/progress: Implemented as a local-first React/TypeScript/Vite app with browser storage and JSON import/export. Validated with `npm run typecheck` and `npm run build` using Linux Node.js.
