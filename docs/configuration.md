# Configuration

The app has runtime configuration for its combined web/API server and persistence backend.

`.env.example` documents all supported variables. Do not put real secrets into `.env.example`.

## Server

- `PORT`: HTTP port for the Node server. Defaults to `8080`.
- `HOST`: Optional bind host. Defaults to `0.0.0.0` in `server/index.js`.
- `MAX_BODY_BYTES`: Maximum accepted JSON state payload size.

## Persistence

- `DATABASE_DRIVER=postgres`: Production mode. Requires `DATABASE_URL` and stores the ledger in PostgreSQL JSONB.
- `DATABASE_DRIVER=file`: Local shared-dev mode. Stores the ledger at `STATE_FILE`.
- `DATABASE_DRIVER=memory`: Test mode. State resets when the process exits.
- `APP_STATE_KEY`: Logical key for the ledger row/document. Keep as `main` unless hosting multiple ledgers.

Empty PostgreSQL databases are not seeded with sample character data. The client shows an empty ledger with default compendium definitions until users create or import data.
