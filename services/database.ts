import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let initPromise: Promise<void> | null = null;

export interface PhotoEntry {
  id: number;
  type: 'encounter' | 'practice';
  uri: string;
  created_at: number;
  ocr_complete: number;
}

export interface KanjiEntry {
  character: string;
  encounter_count: number;
  practice_count: number;
}

export interface WordEntry {
  word: string;
  encounter_count: number;
  practice_count: number;
}

type CountMap = Record<string, number>;

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('kanji-kollect.db');
  }
  return dbPromise;
}

async function ensureInitialized(): Promise<SQLite.SQLiteDatabase> {
  const database = await openDb();
  if (!initPromise) {
    initPromise = (async () => {
      await database.execAsync(`
      CREATE TABLE IF NOT EXISTS photos (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        type            TEXT NOT NULL CHECK(type IN ('encounter', 'practice')),
        uri             TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        ocr_complete    INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS kanji (
        character       TEXT PRIMARY KEY,
        encounter_count INTEGER DEFAULT 0,
        practice_count  INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS photo_kanji (
        photo_id        INTEGER REFERENCES photos(id) ON DELETE CASCADE,
        kanji_char      TEXT REFERENCES kanji(character),
        occurrences     INTEGER DEFAULT 1,
        PRIMARY KEY (photo_id, kanji_char)
      );

      CREATE TABLE IF NOT EXISTS words (
        word            TEXT PRIMARY KEY,
        encounter_count INTEGER DEFAULT 0,
        practice_count  INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS photo_word (
        photo_id        INTEGER REFERENCES photos(id) ON DELETE CASCADE,
        word            TEXT REFERENCES words(word),
        occurrences     INTEGER DEFAULT 1,
        PRIMARY KEY (photo_id, word)
      );

      CREATE INDEX IF NOT EXISTS idx_photo_kanji_char ON photo_kanji(kanji_char);
      CREATE INDEX IF NOT EXISTS idx_photo_word_word ON photo_word(word);
      CREATE INDEX IF NOT EXISTS idx_photos_type ON photos(type);
      `);

      // Migration: add persistent hidden flags for kanji/words.
      const ensureHiddenColumn = async (table: 'kanji' | 'words') => {
        const cols = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
        const hasHidden = cols.some((c) => c.name === 'hidden');
        if (!hasHidden) {
          await database.runAsync(`ALTER TABLE ${table} ADD COLUMN hidden INTEGER DEFAULT 0`);
        }
        if (table === 'kanji') {
          await database.runAsync('CREATE INDEX IF NOT EXISTS idx_kanji_hidden ON kanji(hidden)');
        } else {
          await database.runAsync('CREATE INDEX IF NOT EXISTS idx_words_hidden ON words(hidden)');
        }
      };
      await ensureHiddenColumn('kanji');
      await ensureHiddenColumn('words');
    })();
  }
  await initPromise;
  return database;
}

export async function initDatabase(): Promise<void> {
  await ensureInitialized();
}

// Photo operations
export async function savePhoto(uri: string, type: 'encounter' | 'practice'): Promise<number> {
  const database = await ensureInitialized();
  const result = await database.runAsync(
    'INSERT INTO photos (uri, type, created_at, ocr_complete) VALUES (?, ?, ?, 1)',
    [uri, type, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getAllPhotos(): Promise<PhotoEntry[]> {
  const database = await ensureInitialized();
  return await database.getAllAsync<PhotoEntry>(
    'SELECT * FROM photos ORDER BY created_at DESC'
  );
}

export async function getPhotosByType(type: 'encounter' | 'practice'): Promise<PhotoEntry[]> {
  const database = await ensureInitialized();
  return await database.getAllAsync<PhotoEntry>(
    'SELECT * FROM photos WHERE type = ? ORDER BY created_at DESC',
    [type]
  );
}

export async function deletePhoto(photoId: number): Promise<void> {
  const database = await ensureInitialized();

  // Get photo type and associated kanji/words before deleting
  const photo = await database.getFirstAsync<PhotoEntry>(
    'SELECT * FROM photos WHERE id = ?',
    [photoId]
  );

  if (!photo) return;

  const photoKanji = await database.getAllAsync<{ kanji_char: string; occurrences: number }>(
    'SELECT kanji_char, occurrences FROM photo_kanji WHERE photo_id = ?',
    [photoId]
  );

  const photoWords = await database.getAllAsync<{ word: string; occurrences: number }>(
    'SELECT word, occurrences FROM photo_word WHERE photo_id = ?',
    [photoId]
  );

  // Decrement counts
  const countColumn = photo.type === 'encounter' ? 'encounter_count' : 'practice_count';

  for (const { kanji_char, occurrences } of photoKanji) {
    await database.runAsync(
      `UPDATE kanji SET ${countColumn} = ${countColumn} - ? WHERE character = ?`,
      [occurrences, kanji_char]
    );
  }

  for (const { word, occurrences } of photoWords) {
    await database.runAsync(
      `UPDATE words SET ${countColumn} = ${countColumn} - ? WHERE word = ?`,
      [occurrences, word]
    );
  }

  // Delete photo (cascade will handle junction tables)
  await database.runAsync('DELETE FROM photos WHERE id = ?', [photoId]);

  // Clean up kanji/words with zero counts
  await database.runAsync(
    'DELETE FROM kanji WHERE encounter_count <= 0 AND practice_count <= 0'
  );
  await database.runAsync(
    'DELETE FROM words WHERE encounter_count <= 0 AND practice_count <= 0'
  );
}

// Kanji operations
export async function getKanjiList(): Promise<KanjiEntry[]> {
  const database = await ensureInitialized();
  return await database.getAllAsync<KanjiEntry>(
    'SELECT character, encounter_count, practice_count FROM kanji WHERE hidden = 0 OR hidden IS NULL ORDER BY encounter_count DESC'
  );
}

export async function addPhotoKanji(
  photoId: number,
  photoType: 'encounter' | 'practice',
  kanjiList: string[]
): Promise<void> {
  const counts: CountMap = {};
  for (const c of kanjiList) counts[c] = (counts[c] ?? 0) + 1;
  await setPhotoKanjiCounts(photoId, photoType, counts);
}

export async function getPhotosForKanji(character: string): Promise<PhotoEntry[]> {
  const database = await ensureInitialized();
  return await database.getAllAsync<PhotoEntry>(
    `SELECT p.* FROM photos p
     JOIN photo_kanji pk ON p.id = pk.photo_id
     WHERE pk.kanji_char = ?
     ORDER BY p.created_at DESC`,
    [character]
  );
}

export async function getKanjiForPhoto(photoId: number): Promise<string[]> {
  const database = await ensureInitialized();
  const rows = await database.getAllAsync<{ kanji_char: string }>(
    'SELECT kanji_char FROM photo_kanji WHERE photo_id = ?',
    [photoId]
  );
  return rows.map(r => r.kanji_char);
}

export async function getKanjiCountsForPhoto(photoId: number): Promise<CountMap> {
  const database = await ensureInitialized();
  const rows = await database.getAllAsync<{ kanji_char: string; occurrences: number }>(
    'SELECT kanji_char, occurrences FROM photo_kanji WHERE photo_id = ?',
    [photoId]
  );
  const out: CountMap = {};
  for (const r of rows) out[r.kanji_char] = r.occurrences;
  return out;
}

export async function updatePhotoKanji(
  photoId: number,
  photoType: 'encounter' | 'practice',
  newKanji: string[]
): Promise<void> {
  const counts: CountMap = {};
  for (const c of newKanji) counts[c] = (counts[c] ?? 0) + 1;
  await setPhotoKanjiCounts(photoId, photoType, counts);
}

export async function setPhotoKanjiCounts(
  photoId: number,
  photoType: 'encounter' | 'practice',
  newCounts: CountMap
): Promise<void> {
  const database = await ensureInitialized();
  const countColumn = photoType === 'encounter' ? 'encounter_count' : 'practice_count';

  await database.withTransactionAsync(async () => {
    const current = await getKanjiCountsForPhoto(photoId);
    const allKeys = new Set([...Object.keys(current), ...Object.keys(newCounts)]);

    for (const k of allKeys) {
      const oldN = current[k] ?? 0;
      const newN = newCounts[k] ?? 0;
      if (oldN === newN) continue;

      if (newN <= 0) {
        // Remove association and decrement counts by old occurrences
        if (oldN > 0) {
          await database.runAsync(
            `UPDATE kanji SET ${countColumn} = ${countColumn} - ? WHERE character = ?`,
            [oldN, k]
          );
          await database.runAsync('DELETE FROM photo_kanji WHERE photo_id = ? AND kanji_char = ?', [photoId, k]);
        }
        continue;
      }

      const delta = newN - oldN;
      if (delta !== 0) {
        await database.runAsync(
          `INSERT INTO kanji (character, encounter_count, practice_count)
           VALUES (?, ?, ?)
           ON CONFLICT(character) DO UPDATE SET ${countColumn} = ${countColumn} + ?`,
          [k, photoType === 'encounter' ? Math.max(delta, 0) : 0, photoType === 'practice' ? Math.max(delta, 0) : 0, delta]
        );
      }

      await database.runAsync(
        `INSERT INTO photo_kanji (photo_id, kanji_char, occurrences)
         VALUES (?, ?, ?)
         ON CONFLICT(photo_id, kanji_char) DO UPDATE SET occurrences = ?`,
        [photoId, k, newN, newN]
      );
    }

    await database.runAsync('DELETE FROM kanji WHERE encounter_count <= 0 AND practice_count <= 0');
  });
}

// Word operations
export async function getWordsList(): Promise<WordEntry[]> {
  const database = await ensureInitialized();
  return await database.getAllAsync<WordEntry>(
    'SELECT word, encounter_count, practice_count FROM words WHERE hidden = 0 OR hidden IS NULL ORDER BY encounter_count DESC'
  );
}

export async function getHiddenKanjiList(): Promise<KanjiEntry[]> {
  const database = await ensureInitialized();
  return await database.getAllAsync<KanjiEntry>(
    'SELECT character, encounter_count, practice_count FROM kanji WHERE hidden = 1 ORDER BY (encounter_count + practice_count) DESC, encounter_count DESC'
  );
}

export async function getHiddenWordsList(): Promise<WordEntry[]> {
  const database = await ensureInitialized();
  return await database.getAllAsync<WordEntry>(
    'SELECT word, encounter_count, practice_count FROM words WHERE hidden = 1 ORDER BY (encounter_count + practice_count) DESC, encounter_count DESC'
  );
}

export async function hideKanji(character: string): Promise<void> {
  const database = await ensureInitialized();
  await database.runAsync('UPDATE kanji SET hidden = 1 WHERE character = ?', [character]);
}

export async function unhideKanji(character: string): Promise<void> {
  const database = await ensureInitialized();
  await database.runAsync('UPDATE kanji SET hidden = 0 WHERE character = ?', [character]);
}

export async function hideWord(word: string): Promise<void> {
  const database = await ensureInitialized();
  await database.runAsync('UPDATE words SET hidden = 1 WHERE word = ?', [word]);
}

export async function unhideWord(word: string): Promise<void> {
  const database = await ensureInitialized();
  await database.runAsync('UPDATE words SET hidden = 0 WHERE word = ?', [word]);
}

export async function getWordsContainingKanji(character: string, limit: number = 50): Promise<WordEntry[]> {
  const database = await ensureInitialized();
  // Only words that are already in our `words` table (i.e., spotted by OCR),
  // filtered by the kanji being a substring of the word.
  return await database.getAllAsync<WordEntry>(
    `SELECT word, encounter_count, practice_count
     FROM words
     WHERE word LIKE '%' || ? || '%'
     ORDER BY (encounter_count + practice_count) DESC, encounter_count DESC
     LIMIT ?`,
    [character, limit]
  );
}

export async function addPhotoWords(
  photoId: number,
  photoType: 'encounter' | 'practice',
  wordList: string[]
): Promise<void> {
  const counts: CountMap = {};
  for (const w of wordList) counts[w] = (counts[w] ?? 0) + 1;
  await setPhotoWordCounts(photoId, photoType, counts);
}

export async function getPhotosForWord(word: string): Promise<PhotoEntry[]> {
  const database = await ensureInitialized();
  return await database.getAllAsync<PhotoEntry>(
    `SELECT p.* FROM photos p
     JOIN photo_word pw ON p.id = pw.photo_id
     WHERE pw.word = ?
     ORDER BY p.created_at DESC`,
    [word]
  );
}

export async function getWordsForPhoto(photoId: number): Promise<string[]> {
  const database = await ensureInitialized();
  const rows = await database.getAllAsync<{ word: string }>(
    'SELECT word FROM photo_word WHERE photo_id = ?',
    [photoId]
  );
  return rows.map(r => r.word);
}

export async function getWordCountsForPhoto(photoId: number): Promise<CountMap> {
  const database = await ensureInitialized();
  const rows = await database.getAllAsync<{ word: string; occurrences: number }>(
    'SELECT word, occurrences FROM photo_word WHERE photo_id = ?',
    [photoId]
  );
  const out: CountMap = {};
  for (const r of rows) out[r.word] = r.occurrences;
  return out;
}

export async function updatePhotoWords(
  photoId: number,
  photoType: 'encounter' | 'practice',
  newWords: string[]
): Promise<void> {
  const counts: CountMap = {};
  for (const w of newWords) counts[w] = (counts[w] ?? 0) + 1;
  await setPhotoWordCounts(photoId, photoType, counts);
}

export async function setPhotoWordCounts(
  photoId: number,
  photoType: 'encounter' | 'practice',
  newCounts: CountMap
): Promise<void> {
  const database = await ensureInitialized();
  const countColumn = photoType === 'encounter' ? 'encounter_count' : 'practice_count';

  await database.withTransactionAsync(async () => {
    const current = await getWordCountsForPhoto(photoId);
    const allKeys = new Set([...Object.keys(current), ...Object.keys(newCounts)]);

    for (const w of allKeys) {
      const oldN = current[w] ?? 0;
      const newN = newCounts[w] ?? 0;
      if (oldN === newN) continue;

      if (newN <= 0) {
        if (oldN > 0) {
          await database.runAsync(
            `UPDATE words SET ${countColumn} = ${countColumn} - ? WHERE word = ?`,
            [oldN, w]
          );
          await database.runAsync('DELETE FROM photo_word WHERE photo_id = ? AND word = ?', [photoId, w]);
        }
        continue;
      }

      const delta = newN - oldN;
      if (delta !== 0) {
        await database.runAsync(
          `INSERT INTO words (word, encounter_count, practice_count)
           VALUES (?, ?, ?)
           ON CONFLICT(word) DO UPDATE SET ${countColumn} = ${countColumn} + ?`,
          [w, photoType === 'encounter' ? Math.max(delta, 0) : 0, photoType === 'practice' ? Math.max(delta, 0) : 0, delta]
        );
      }

      await database.runAsync(
        `INSERT INTO photo_word (photo_id, word, occurrences)
         VALUES (?, ?, ?)
         ON CONFLICT(photo_id, word) DO UPDATE SET occurrences = ?`,
        [photoId, w, newN, newN]
      );
    }

    await database.runAsync('DELETE FROM words WHERE encounter_count <= 0 AND practice_count <= 0');
  });
}
