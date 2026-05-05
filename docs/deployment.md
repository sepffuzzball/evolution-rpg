# Deployment

## Application server

Run `npm run build` and then `npm start` to serve both the React app and `/api/state` from the Node server.

For production persistence, set:

```bash
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://user:password@host:5432/evolution_rpg
```

The server creates the `app_state` table if it does not exist. The equivalent schema is in `server/migrations/001_app_state.sql` for managed migration workflows.

## Docker

```bash
docker build -t evolution-rpg .
docker run --rm -p 8080:8080 \
  -e DATABASE_DRIVER=postgres \
  -e DATABASE_URL=postgres://user:password@host:5432/evolution_rpg \
  evolution-rpg
```

The container runs the Node web/API server as the non-root `node` user on port 8080.

For local container testing without PostgreSQL, use `DATABASE_DRIVER=file` and mount a volume for `.data/` if state should survive container restarts.

## GitHub Actions

`.github/workflows/docker-image.yml` builds images on pull requests and pushes. It pushes to GitHub Container Registry only for pushes to `main`, `master`, or version tags.
