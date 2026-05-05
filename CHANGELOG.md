# Changelog

All notable changes to this project will be documented in this file.

The format follows the common `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security` sections. This project uses Semantic Versioning.

## [Unreleased]

### Added

- Shared Node API persistence through `GET /api/state` and `PUT /api/state`.
- PostgreSQL JSONB storage with file and memory adapters for local development and tests.
- Revision/ETag checks that reject stale ledger saves with `409 Conflict`.
- Persistence adapter tests using Node's built-in test runner.

### Changed

- Browser data is no longer stored in `localStorage`; all users connected to the same server see the same ledger.
- Empty databases now start with default compendium definitions but no sample production characters.

## [0.1.0] - 2026-05-02

### Added

- Initial React/TypeScript web application for Evolution RPG character creation and sheet tracking.
- Multi-player roster, local persistence, JSON import/export, character type rules, stats, skills, items, and System path visualization.
- Project documentation, Dockerfile, GitHub Actions Docker workflow, and agent workflow metadata.
- Compendium for Race, Class, and Job templates with draggable radar charts for stat-growth ratios.
- Drag/drop assignment of Race, Class, and Job templates during character creation or tier-up.
- Race/Class/Job level-up modal that summarizes stat points added from tier, rarity, character type, and radar ratio formulas.
- Race templates now include Humanoid, Half-Monster, and Monster tags; character creation filters races by character type.
- Create/Edit now uses separate Race, Class, Job, Skills, Items, and Review steps and no longer exposes manual stat editing.
- Compendium now includes Affinities, Skills, and Items with default affinity and skill templates.
- Item templates support tier, rarity, stat radar charts, and item-skill attachments with rarity-based limits.
- Character sheets now support equipping/dequipping inventory items and setting available item skills.

### Fixed

- System Path now derives live race, class, and job milestones from the current character tracks instead of showing only the original starting race path entry.

### Changed

- Race, class, job, and skill progression now uses read-only levels and 10-stage EXP bars with +/- controls; filling an EXP bar automatically levels up the related track or skill.
- Race/Class/Job catalog wording changed to Compendium, notes fields changed to descriptions, formulas/ratio values are hidden from the editor UI, and all visible stat values are rounded to integers.
