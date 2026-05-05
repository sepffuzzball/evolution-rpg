# Development

## Setup

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev`: Start Vite dev server.
- `npm run typecheck`: Run TypeScript project checks.
- `npm run build`: Typecheck and produce production assets in `dist/`.
- `npm run preview`: Serve the production build locally.

## Coding notes

- Keep RPG rule constants in `src/data.ts` aligned with the Markdown rule files.
- Keep persisted shapes in `src/types.ts` stable or add migration logic in `src/storage.ts`.
- Prefer small, typed helpers for calculations used by the sheet.
