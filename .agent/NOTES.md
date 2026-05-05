# Agent Notes

- Useful commands:
  - `npm install`
  - `npm run dev`
  - `npm start`
  - `npm test`
  - `npm run typecheck`
  - `npm run build`
  - `docker build -t evolution-rpg .`
- In this WSL environment, the default `npm` may resolve to Windows `cmd.exe` on a UNC path; use a Linux Node.js install in `PATH` for reliable validation.
- Persistence is server-side through `server/storage.js`: `postgres` for production, `file` for local shared dev, `memory` for tests.
- Use the app Export button for manual backups before database migrations or destructive maintenance.
- The Windows Node binary has been able to run `node.exe --test server/storage.test.js` when Linux `node` is absent.
