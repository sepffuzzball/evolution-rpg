# Evolution RPG System Ledger

Evolution RPG System Ledger is a browser-based character creator and character sheet manager for the Evolution RPG setting described in this repository. It helps a table track players, humanoids, monsters, half-monsters, races, classes, jobs, skills, items, stats, tiers, levels, and each character's path through *The System*.

## What it solves

The RPG rules separate character growth by type:

- Humanoids use race, class, and job progression.
- Monsters use race progression only.
- Half-monsters use race progression and must choose either a class or a job.

The app makes those constraints visible while giving each character a persistent sheet and a tier-by-tier path visualization.

## Features

- Multi-player / multi-character roster.
- Compendium for reusable Race, Class, Job, stat metadata/formulas, Affinity, Skill, and Item templates.
- Guided character creation and editing wizard.
- Drag/drop Race, Class, and Job assignment during character creation or tier-up.
- Draggable radar/spider chart editors for stat-growth ratios; raw ratio values are hidden from players.
- Humanoid, monster, and half-monster rule gating.
- Race, class, job, tier, level, and staged EXP tracking.
- Read-only levels and 10-stage EXP bars with +/- controls; filling the bar automatically levels the track or skill.
- Database-backed secondary stat calculations, including HP, MP, SP, and DP defaults.
- Active and passive skill tracking with source, rarity, level, staged EXP, MP cost, casting time, and cooldown.
- Item tracking with equipment slot type, rarity, stat bonuses, and item skill set state.
- Item skill limit display based on character tier.
- Visual tier timeline from Starter through God tier.
- Level-up modal with stat gain summary when race/class/job tracks level up.
- Character sheet inventory supports equipping/dequipping items and setting available item skills within tier limits.
- Shared server-side persistence through an API/database layer plus JSON export/import for backups or migration.

## Growth formulas

Rarity multipliers are stored in the shared ledger and managed from the Compendium's Rarities tab. Defaults are Common `1`, Uncommon `1.5`, Rare `2`, Epic `2.5`, Legendary `3`, Mythical `3.5`, and Divine `4`.

Character type multipliers are also stored in the shared ledger and managed from the Compendium's Types tab.

Stat categories, primary stat labels/roles, and secondary stat formulas are stored in the shared ledger and managed from the Compendium's Stat Categories, Primary Stats, and Secondary Stats tabs. HP remains `(Fortitude × Current Tier) + Strength`, MP remains `(Mana × Current Tier) + Intelligence`, SP defaults to `(Fortitude × Current Tier) + Agility`, and DP defaults to `(Charisma × Current Tier) + Wisdom`.

Tier definitions are stored in the shared ledger and managed from the Compendium's Tiers tab. Each tier defines its number, title, description, max level, race/class/job/item multipliers, and static tier bonus. Defaults preserve the old formulas: race/class/job multipliers are `Tier × 20`, item multipliers are `Tier × 10`, and static tier bonuses are `Tier × 10`.

- Race level-up points: `Character Type × Tier Race Multiplier × Rarity`
  - Humanoid = `1`
  - Half-monster = `2`
  - Monster = `3`
- Class level-up points: `Tier Class Multiplier × Rarity`
- Job level-up points: `Tier Job Multiplier × Rarity`

Compendium radar charts define stat ratios only. The formulas calculate actual points at level-up time. For race/class/job tracks, `Tier` is the actual tier record the track is assigned to; it is not the template's minimum available tier.
Each level in a track contributes one full point pool, including level 1.

Item stat bonuses use `Tier Item Multiplier × Rarity` and the item's radar-chart ratio. Static tier bonuses add to every stat at the start of each reached tier. Item templates can hold item skills based on rarity order: Common 0, Uncommon 1, Rare 2, Epic 3, Legendary 4, Mythical 5, and Divine 6 by default.

## Tech stack

- React
- TypeScript
- Vite
- Node HTTP API/server
- PostgreSQL JSONB persistence via `pg`, with file and memory adapters for local/test use
- Docker multi-stage build served by a non-root Node runtime

## Repository structure

```text
.
├── src/                     # React application source
├── server/                  # Node API server and persistence adapters
├── docs/                    # Project architecture, development, deployment, and operations docs
├── .agent/                  # Agent task board, decisions, and operational notes
├── .github/workflows/       # Docker image CI workflow
├── Classes.md               # RPG class rules
├── Items.md                 # RPG item rules
├── Jobs.md                  # RPG job rules
├── Races.md                 # RPG race/evolution rules
├── Rarities.md              # RPG rarity list
├── Skills.md                # RPG skill rules
├── StatSheet.md             # RPG sheet/stat formulas
├── System.md                # RPG System overview
├── Tiers.md                 # RPG tier level caps
├── package.json             # Node project metadata and scripts
└── Dockerfile               # Production container build
```

## Requirements

- Node.js 20 or newer is recommended.
- npm 10 or newer.
- Docker, if building/running the container.

## Quick start

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually <http://localhost:5173>. For shared persistence during local development, build and run the API server with `npm run build && npm start`, or proxy/run the frontend against a separately started server.

## Configuration

Runtime settings are documented in `.env.example`. Use `DATABASE_DRIVER=postgres` and `DATABASE_URL` for production deployments. Use `DATABASE_DRIVER=file` for simple local shared development, or `DATABASE_DRIVER=memory` for tests.

## Environment variables

- `PORT`: HTTP port for the combined web/API server.
- `DATABASE_DRIVER`: `postgres`, `file`, or `memory`.
- `DATABASE_URL`: PostgreSQL connection string, required for `postgres`.
- `APP_STATE_KEY`: Logical key for the shared ledger row.
- `STATE_FILE`: File path for the file adapter.
- `MAX_BODY_BYTES`: Maximum JSON state payload size.

## Local development

```bash
npm run dev       # Start local dev server
npm start         # Serve built app and API from dist/
npm test          # Run storage adapter tests
npm run typecheck # Run TypeScript checks
npm run build     # Build production static assets
```

## Running tests

Run automated tests and validation with:

```bash
npm test
npm run build
```

See `docs/testing.md` for suggested next test coverage.

## Docker usage

Build and run locally:

```bash
docker build -t evolution-rpg .
docker run --rm -p 8080:8080 \
  -e DATABASE_DRIVER=postgres \
  -e DATABASE_URL=postgres://user:password@host:5432/evolution_rpg \
  evolution-rpg
```

Open <http://localhost:8080>.

## Deployment notes

The production container serves both the single-page app and `/api/state`. Use PostgreSQL for durable multi-user deployments. Empty databases are not seeded with sample character data; users create or import the first real ledger entries.

## Versioning and release process

This project uses Semantic Versioning through `package.json`. Release notes are maintained in `CHANGELOG.md`.

## Architecture links

- `docs/architecture.md`
- `docs/development.md`
- `docs/deployment.md`
- `docs/configuration.md`
- `docs/operations.md`
- `docs/security.md`
- `docs/testing.md`
- `docs/troubleshooting.md`

## Troubleshooting

- If data does not load, check the `/health` endpoint, server logs, and database connectivity.
- If PostgreSQL starts empty, create or import ledger data from the UI; sample production data is intentionally not inserted.
- Use Export regularly to create JSON backups.
- If a build fails after dependency upgrades, remove `node_modules` and reinstall.

## Contributing notes

Keep the RPG rule documents and application assumptions in sync. If race/class/job rules change, update `src/data.ts`, `src/types.ts`, and relevant docs.

## License

No license has been specified yet.
