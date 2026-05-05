# Security

## Secrets

Production PostgreSQL deployments require database credentials through environment variables. Do not commit `.env` files, API keys, tokens, credentials, or private campaign data.

## Data sensitivity

Character sheets and notes may contain private table or player information. Exported JSON should be treated as table data and shared intentionally.

## Server storage

Ledger data is stored by the server-side persistence adapter, not in browser storage. Anyone with access to the deployed app can currently view and edit the shared ledger, so host it only for trusted table members until authentication is added.

## Future backend considerations

Add authentication, authorization by campaign/table, server-side validation, audit-friendly backups, and database backup/restore procedures before exposing the app broadly.
