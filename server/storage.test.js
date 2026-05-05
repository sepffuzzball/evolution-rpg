import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { StateConflictError, createFileStore, createMemoryStore } from './storage.js';

test('memory store keeps state isolated by app key', async () => {
  const previousKey = process.env.APP_STATE_KEY;
  const store = createMemoryStore();

  try {
    process.env.APP_STATE_KEY = 'alpha';
    assert.equal(await store.saveState({ value: 1 }, 0), 1);
    assert.deepEqual(await store.getState(), { state: { value: 1 }, revision: 1 });

    process.env.APP_STATE_KEY = 'beta';
    assert.equal(await store.getState(), null);
  } finally {
    if (previousKey === undefined) delete process.env.APP_STATE_KEY;
    else process.env.APP_STATE_KEY = previousKey;
  }
});

test('memory store rejects stale revisions', async () => {
  const store = createMemoryStore();
  await store.saveState({ value: 1 }, 0);
  await assert.rejects(() => store.saveState({ value: 2 }, 0), StateConflictError);
});

test('file store persists state to disk', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'evolution-rpg-'));
  const previousFile = process.env.STATE_FILE;
  process.env.STATE_FILE = path.join(dir, 'state.json');

  try {
    const firstStore = createFileStore();
    assert.equal(await firstStore.getState(), null);

    assert.equal(await firstStore.saveState({ name: 'Ada' }, 0), 1);

    const secondStore = createFileStore();
    assert.deepEqual(await secondStore.getState(), { state: { name: 'Ada' }, revision: 1 });
  } finally {
    if (previousFile === undefined) delete process.env.STATE_FILE;
    else process.env.STATE_FILE = previousFile;
    await rm(dir, { recursive: true, force: true });
  }
});
