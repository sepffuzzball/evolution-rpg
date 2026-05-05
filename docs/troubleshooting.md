# Troubleshooting

## The app opens but my characters are gone

The app uses browser-local storage. Check whether you changed browsers, used private mode, cleared site data, or opened a different host/port. Restore from a JSON export if available.

## Import fails

Confirm the file was exported by this app and is valid JSON. If the data shape changed after a future update, add migration logic in `src/storage.ts`.

## Build fails after dependencies change

Remove `node_modules`, reinstall, and run the build again:

```bash
rm -rf node_modules
npm install
npm run build
```

## Docker image does not start

Confirm port 8080 is exposed and mapped:

```bash
docker run --rm -p 8080:8080 evolution-rpg
```
