import * as SQLite from 'expo-sqlite';

import { WORD_BUCKET_LOADERS, type WordEntryTuple } from './generated/wordBucketLoaders';

type KanjiRow = {
  character: string;
  onyomi_json: string;
  kunyomi_json: string;
  meanings_json: string;
};

type WordRow = {
  surface: string;
  reading: string;
  meanings_json: string;
};

const DICT_DB_NAME = 'dictionary.db';
const DICT_BUILD_DB_NAME = 'dictionary.build.db';
const DICT_DB_VERSION = 1;

let dictDbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let buildDbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let ensurePromise: Promise<void> | null = null;
let ready = false;
let dictReadOnlyConfigured = false;

function yieldToJs(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

async function openDictDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dictDbPromise) {
    // Separate DB file from CRUD DB to avoid contention.
    dictDbPromise = SQLite.openDatabaseAsync(DICT_DB_NAME, { useNewConnection: true });
  }
  return dictDbPromise;
}

async function openBuildDb(): Promise<SQLite.SQLiteDatabase> {
  if (!buildDbPromise) {
    // Always isolate the build into a temp DB file.
    buildDbPromise = SQLite.openDatabaseAsync(DICT_BUILD_DB_NAME, { useNewConnection: true });
  }
  return buildDbPromise;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withBusyRetry<T>(op: () => Promise<T>, label: string): Promise<T> {
  const delays = [50, 150, 400, 900, 1800];
  let lastErr: unknown;
  for (let i = 0; i < delays.length; i++) {
    try {
      return await op();
    } catch (e) {
      lastErr = e;
      const msg = (e as any)?.message ?? String(e);
      const isLocked =
        typeof msg === 'string' &&
        (msg.includes('database is locked') || msg.includes('SQLITE_BUSY') || msg.includes('locked'));
      if (!isLocked) throw e;
      await sleep(delays[i]);
    }
  }
  throw new Error(`${label} failed after retries: ${(lastErr as any)?.message ?? String(lastErr)}`);
}

async function ensurePragmas(db: SQLite.SQLiteDatabase): Promise<void> {
  // WAL improves read/write concurrency inside this DB during the one-time import.
  // busy_timeout reduces transient "database is locked" errors.
  await withBusyRetry(
    async () =>
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;
        PRAGMA busy_timeout = 15000;
      `),
    'ensurePragmas'
  );
}

async function ensureSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await withBusyRetry(
    async () =>
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS kanji (
          character     TEXT PRIMARY KEY,
          onyomi_json   TEXT NOT NULL,
          kunyomi_json  TEXT NOT NULL,
          meanings_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS words (
          surface       TEXT PRIMARY KEY,
          reading       TEXT NOT NULL,
          meanings_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_words_surface ON words(surface);
      `),
    'ensureSchema'
  );
}

async function getUserVersion(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

async function setUserVersion(db: SQLite.SQLiteDatabase, v: number): Promise<void> {
  await withBusyRetry(async () => await db.execAsync(`PRAGMA user_version = ${v};`), 'setUserVersion');
}

async function importWords(db: SQLite.SQLiteDatabase): Promise<void> {
  const keys = Object.keys(WORD_BUCKET_LOADERS).sort();
  for (const key of keys) {
    // Loading JSON buckets via `require()` is synchronous and will be cached by Metro.
    // This runs once; subsequent app launches will use SQLite and avoid requiring buckets.
    const bucket: readonly WordEntryTuple[] = WORD_BUCKET_LOADERS[key]?.() ?? [];
    if (!bucket.length) {
      await yieldToJs();
      continue;
    }

    await db.withExclusiveTransactionAsync(async (txn) => {
      const stmt = await txn.prepareAsync('INSERT OR REPLACE INTO words (surface, reading, meanings_json) VALUES (?, ?, ?)');
      try {
        for (const [surface, reading, meanings] of bucket) {
          await stmt.executeAsync(surface, reading, JSON.stringify(meanings ?? []));
        }
      } finally {
        await stmt.finalizeAsync();
      }
    });

    await yieldToJs();
  }
}

async function importKanji(db: SQLite.SQLiteDatabase): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const kanjiDict = require('../assets/dictionaries/kanji.json') as Record<
    string,
    { readings: { onyomi: string[]; kunyomi: string[] }; meanings: string[] }
  >;

  const entries = Object.entries(kanjiDict);
  const batchSize = 500;

  for (let i = 0; i < entries.length; i += batchSize) {
    const slice = entries.slice(i, i + batchSize);
    await db.withExclusiveTransactionAsync(async (txn) => {
      const stmt = await txn.prepareAsync(
        'INSERT OR REPLACE INTO kanji (character, onyomi_json, kunyomi_json, meanings_json) VALUES (?, ?, ?, ?)'
      );
      try {
        for (const [character, data] of slice) {
          const onyomi = data?.readings?.onyomi ?? [];
          const kunyomi = data?.readings?.kunyomi ?? [];
          const meanings = data?.meanings ?? [];
          await stmt.executeAsync(
            character,
            JSON.stringify(onyomi),
            JSON.stringify(kunyomi),
            JSON.stringify(meanings)
          );
        }
      } finally {
        await stmt.finalizeAsync();
      }
    });
    await yieldToJs();
  }
}

async function rebuildDictionary(db: SQLite.SQLiteDatabase): Promise<void> {
  await ensurePragmas(db);
  await ensureSchema(db);

  // Clear any partial prior import.
  await withBusyRetry(
    async () =>
      await db.execAsync(`
        DELETE FROM words;
        DELETE FROM kanji;
      `),
    'clearDictionaryTables'
  );

  await importWords(db);
  await importKanji(db);
  await setUserVersion(db, DICT_DB_VERSION);
}

async function configureDictReadOnly(db: SQLite.SQLiteDatabase): Promise<void> {
  if (dictReadOnlyConfigured) return;
  // Prevent accidental writes to the dictionary DB for the lifetime of this connection.
  await withBusyRetry(async () => await db.execAsync('PRAGMA query_only = ON;'), 'configureDictReadOnly');
  dictReadOnlyConfigured = true;
}

/**
 * Starts (and caches) the one-time dictionary DB build if needed.
 * This function does not throw; failures will keep the app on JSON fallback.
 */
export async function ensureDictionarySqliteStarted(): Promise<void> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      // If the final dictionary DB is already built, do not rebuild.
      const existingDb = await openDictDb();
      await ensurePragmas(existingDb);
      const v = await getUserVersion(existingDb);
      if (v === DICT_DB_VERSION) {
        await configureDictReadOnly(existingDb);
        ready = true;
        return;
      }
      // Close the existing connection before attempting to delete/replace the DB file.
      try {
        await existingDb.closeAsync();
      } catch {}
      dictDbPromise = null;
      dictReadOnlyConfigured = false;

      // Build into a temp DB to avoid any partial/locked state in the final DB.
      try {
        await SQLite.deleteDatabaseAsync(DICT_BUILD_DB_NAME);
      } catch {}
      buildDbPromise = null;
      const buildDb = await openBuildDb();
      await rebuildDictionary(buildDb);

      // Replace/refresh final DB from the temp build using sqlite backup.
      try {
        await SQLite.deleteDatabaseAsync(DICT_DB_NAME);
      } catch {}
      const destDb = await openDictDb();
      await SQLite.backupDatabaseAsync({ sourceDatabase: buildDb, destDatabase: destDb });
      await configureDictReadOnly(destDb);

      // Close build DB to release any file locks.
      try {
        await buildDb.closeAsync();
      } catch {}
      buildDbPromise = null;

      ready = true;
    } catch (e) {
      // Do not break the app; JSON fallback remains available.
      // eslint-disable-next-line no-console
      console.error('Dictionary SQLite build failed; using JSON fallback.', e);
      ready = false;
    }
  })();
  return ensurePromise;
}

/**
 * Returns a DB handle only after the dictionary DB is fully built.
 */
export async function getDictionaryDbIfReady(): Promise<SQLite.SQLiteDatabase | null> {
  if (!ready) return null;
  const db = await openDictDb();
  await configureDictReadOnly(db);
  return db;
}

export async function lookupKanjiSqlite(character: string): Promise<KanjiRow | null> {
  const db = await getDictionaryDbIfReady();
  if (!db) return null;
  return await db.getFirstAsync<KanjiRow>(
    'SELECT character, onyomi_json, kunyomi_json, meanings_json FROM kanji WHERE character = ?',
    [character]
  );
}

export async function lookupWordSqlite(surface: string): Promise<WordRow | null> {
  const db = await getDictionaryDbIfReady();
  if (!db) return null;
  return await db.getFirstAsync<WordRow>(
    'SELECT surface, reading, meanings_json FROM words WHERE surface = ?',
    [surface]
  );
}

export async function lookupWordPrefixCandidatesSqlite(prefix: string, limit: number): Promise<WordRow[] | null> {
  const db = await getDictionaryDbIfReady();
  if (!db) return null;
  // ORDER BY surface allows scanning lexicographically similar to the JSON binary search approach.
  return await db.getAllAsync<WordRow>(
    'SELECT surface, reading, meanings_json FROM words WHERE surface LIKE ? ORDER BY surface LIMIT ?',
    [`${prefix}%`, limit]
  );
}

export async function isKnownKanjiSqlite(character: string): Promise<boolean | null> {
  const db = await getDictionaryDbIfReady();
  if (!db) return null;
  const row = await db.getFirstAsync<{ ok: number }>('SELECT 1 as ok FROM kanji WHERE character = ? LIMIT 1', [
    character,
  ]);
  return !!row;
}

/**
 * Batch lookup for multiple kanji. Returns a map of character -> KanjiRow.
 * Missing characters are simply not included in the map.
 */
export async function lookupKanjiBatchSqlite(characters: string[]): Promise<Map<string, KanjiRow> | null> {
  if (!characters.length) return new Map();
  const db = await getDictionaryDbIfReady();
  if (!db) return null;
  const placeholders = characters.map(() => '?').join(',');
  const rows = await db.getAllAsync<KanjiRow>(
    `SELECT character, onyomi_json, kunyomi_json, meanings_json FROM kanji WHERE character IN (${placeholders})`,
    characters
  );
  const map = new Map<string, KanjiRow>();
  for (const r of rows) map.set(r.character, r);
  return map;
}

/**
 * Batch lookup for multiple words. Returns a map of surface -> WordRow.
 * Missing words are simply not included in the map.
 */
export async function lookupWordBatchSqlite(surfaces: string[]): Promise<Map<string, WordRow> | null> {
  if (!surfaces.length) return new Map();
  const db = await getDictionaryDbIfReady();
  if (!db) return null;
  const placeholders = surfaces.map(() => '?').join(',');
  const rows = await db.getAllAsync<WordRow>(
    `SELECT surface, reading, meanings_json FROM words WHERE surface IN (${placeholders})`,
    surfaces
  );
  const map = new Map<string, WordRow>();
  for (const r of rows) map.set(r.surface, r);
  return map;
}


