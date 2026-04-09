/**
 * Offline dictionary service.
 *
 * Uses generated JSON files in `assets/dictionaries/` built by:
 *   `node scripts/build_dictionaries.mjs`
 */

import type { WordEntryTuple } from './generated/wordBucketLoaders';
import { WORD_BUCKET_LOADERS } from './generated/wordBucketLoaders';
import {
  isKnownKanjiSqlite,
  lookupKanjiSqlite,
  lookupKanjiBatchSqlite,
  lookupWordPrefixCandidatesSqlite,
  lookupWordSqlite,
  lookupWordBatchSqlite,
} from './dictionarySqlite';

export interface KanjiInfo {
  character: string;
  readings: {
    onyomi: string[];
    kunyomi: string[];
  };
  meanings: string[];
}

export interface WordInfo {
  word: string;
  reading: string;
  meaning: string[];
}

type KanjiDict = Record<string, { readings: { onyomi: string[]; kunyomi: string[] }; meanings: string[] }>;

let kanjiDict: KanjiDict | null = null;

function normalizeReading(reading: string): string {
  // KANJIDIC2 kunyomi often uses '.' to mark okurigana (e.g. と.まる) and '-' placeholders.
  // For this app, strip these for readability and better search.
  return reading.replace(/[.\-]/g, '');
}

async function ensureKanjiLoaded(): Promise<KanjiDict> {
  if (!kanjiDict) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    kanjiDict = require('../assets/dictionaries/kanji.json') as KanjiDict;
  }
  return kanjiDict;
}

function getWordBucketJson(key: string): readonly WordEntryTuple[] {
  try {
    return WORD_BUCKET_LOADERS[key]?.() ?? [];
  } catch {
    return [];
  }
}

const EXCLUDED_POS = new Set([
  'prt',
  'cop',
  'aux-v',
  'aux-adj',
  'aux',
  'suf',
  'pref',
  'n-pref',
  'n-suf',
  'conj',
  'unc',
]);

function normalizeEntityTag(t: string): string {
  const s = t.replace(/^&/, '').replace(/;$/, '').trim();
  // Backward compatibility: if buckets were built with entity-expansion enabled,
  // POS tags may be English descriptions (e.g. "particle") instead of codes ("prt").
  switch (s) {
    case 'particle':
      return 'prt';
    case 'copula':
      return 'cop';
    case 'auxiliary verb':
      return 'aux-v';
    case 'auxiliary adjective':
      return 'aux-adj';
    case 'auxiliary':
      return 'aux';
    default:
      return s;
  }
}

function isExcludedPos(pos: readonly string[] | undefined | null): boolean {
  if (!pos || !pos.length) return false;
  // Only exclude if ALL POS tags are in the blocklist.
  // This prevents filtering out words like "救われない" (hopeless) that have
  // a content meaning (adj-i) alongside a grammatical tag.
  for (const p of pos) {
    const tag = normalizeEntityTag(String(p ?? ''));
    if (!EXCLUDED_POS.has(tag)) return false; // Has at least one non-excluded tag
  }
  return true; // All tags were excluded
}

export async function lookupKanji(character: string): Promise<KanjiInfo | null> {
  const row = await lookupKanjiSqlite(character);
  if (row) {
    const onyomi = JSON.parse(row.onyomi_json ?? '[]') as string[];
    const kunyomi = JSON.parse(row.kunyomi_json ?? '[]') as string[];
    const meanings = JSON.parse(row.meanings_json ?? '[]') as string[];
    return { character, readings: { onyomi, kunyomi }, meanings };
  }

  const dict = await ensureKanjiLoaded();
  const data = dict[character];
  if (!data) return null;
  return {
    character,
    readings: data.readings,
    meanings: data.meanings,
  };
}

export async function lookupKanjiNormalized(character: string): Promise<KanjiInfo | null> {
  const info = await lookupKanji(character);
  if (!info) return null;
  return {
    character: info.character,
    meanings: info.meanings,
    readings: {
      onyomi: info.readings.onyomi.map(normalizeReading).filter(Boolean),
      kunyomi: info.readings.kunyomi.map(normalizeReading).filter(Boolean),
    },
  };
}

function bucketKeyForWord(word: string): string {
  const cp = word.codePointAt(0) ?? 0;
  const idx = cp % 64;
  return idx.toString(16).padStart(2, '0');
}

function binarySearchWord(entries: readonly WordEntryTuple[], word: string): WordEntryTuple | null {
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const k = entries[mid][0];
    if (k === word) return entries[mid];
    if (k < word) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

export async function lookupWord(word: string): Promise<WordInfo | null> {
  if (!word) return null;
  const row = await lookupWordSqlite(word);
  if (row) {
    const meaning = JSON.parse(row.meanings_json ?? '[]') as string[];
    const pos = JSON.parse(row.pos_json ?? '[]') as string[];
    if (isExcludedPos(pos)) return null;
    return { word: row.surface, reading: row.reading, meaning };
  }

  const key = bucketKeyForWord(word);
  const entries = getWordBucketJson(key);
  if (!entries.length) return null;
  const hit = binarySearchWord(entries, word);
  if (!hit) return null;
  if (isExcludedPos(hit[3])) return null;
  return { word, reading: hit[1], meaning: hit[2] };
}

function lowerBound(entries: readonly WordEntryTuple[], word: string): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid][0] < word) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function stripTrailingParticles(word: string): string {
  // Conservative stripping of common particles/connectors at the very end.
  // This is intended for OCR cases like "電車は" -> "電車" without removing okurigana.
  const particles = ['から', 'まで', 'より', 'には', 'では', 'へ', 'を', 'が', 'は', 'に', 'で', 'と', 'も', 'や', 'の', 'ね', 'よ', 'ぞ'];
  let out = word;
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of particles) {
      if (out.endsWith(p) && out.length > p.length) {
        out = out.slice(0, -p.length);
        changed = true;
        break;
      }
    }
  }
  return out;
}

function stripTrailingHiragana(word: string): string {
  return word.replace(/[\u3040-\u309f]+$/g, '');
}

function hasAnyKanji(word: string): boolean {
  return /[\u4e00-\u9faf]/.test(word);
}

function isAllHiragana(s: string): boolean {
  return !!s && /^[\u3040-\u309f]+$/.test(s);
}

async function lookupWordByPrefixUnique(prefix: string): Promise<WordInfo | null> {
  if (!prefix) return null;

  // SQLite path (only once the on-device DB build is complete).
  const sqliteRows = await lookupWordPrefixCandidatesSqlite(prefix, 81);
  if (sqliteRows) {
    const maxScan = 80;
    const candidates: Array<{ surface: string; reading: string; meanings: string[] }> = [];
    for (const r of sqliteRows) {
      const surface = r.surface;
      if (!surface.startsWith(prefix)) break;
      const remainder = surface.slice(prefix.length);
      if (!remainder || isAllHiragana(remainder)) {
        const pos = JSON.parse(r.pos_json ?? '[]') as string[];
        if (isExcludedPos(pos)) continue;
        candidates.push({
          surface,
          reading: r.reading,
          meanings: JSON.parse(r.meanings_json ?? '[]') as string[],
        });
      }
      if (candidates.length > maxScan) break;
    }

    if (candidates.length !== 1) return null;
    const hit = candidates[0];
    return { word: hit.surface, reading: hit.reading, meaning: hit.meanings };
  }

  // JSON fallback (bucket-local binary search).
  const key = bucketKeyForWord(prefix);
  const entries = getWordBucketJson(key);
  if (!entries.length) return null;

  const start = lowerBound(entries, prefix);
  const maxScan = 80;
  const candidates: WordEntryTuple[] = [];
  for (let i = start; i < entries.length && candidates.length <= maxScan; i++) {
    const surface = entries[i][0];
    if (!surface.startsWith(prefix)) break;
    const remainder = surface.slice(prefix.length);
    if (!remainder || isAllHiragana(remainder)) {
      if (isExcludedPos(entries[i][3])) continue;
      candidates.push(entries[i]);
    }
  }

  if (candidates.length !== 1) return null;
  const hit = candidates[0];
  return { word: hit[0], reading: hit[1], meaning: hit[2] };
}

/**
 * Best-effort word lookup that tolerates common OCR variations:
 * - Keeps okurigana when present, but strips trailing particles (e.g. "電車は" -> "電車")
 * - If still not found, tries the kana-stripped form (legacy behavior)
 * - If the input is a kanji-only prefix (legacy-stripped), attempts a UNIQUE okurigana completion
 */
export async function lookupWordFlexible(word: string): Promise<WordInfo | null> {
  const w = word.trim();
  if (!w) return null;

  const direct = await lookupWord(w);
  if (direct) return direct;

  const noParticles = stripTrailingParticles(w);
  if (noParticles !== w) {
    const hit = await lookupWord(noParticles);
    if (hit) return hit;
  }

  const noHira = stripTrailingHiragana(w);
  if (noHira && noHira !== w) {
    const hit = await lookupWord(noHira);
    if (hit) return hit;

    // Legacy-stripped words: try to complete okurigana uniquely (e.g. "見直" -> "見直す")
    if (hasAnyKanji(noHira)) {
      const prefixHit = await lookupWordByPrefixUnique(noHira);
      if (prefixHit) return prefixHit;
    }
  }

  if (hasAnyKanji(w)) {
    const prefixHit = await lookupWordByPrefixUnique(w);
    if (prefixHit) return prefixHit;
  }

  return null;
}

export async function isKnownKanji(character: string): Promise<boolean> {
  const sqlite = await isKnownKanjiSqlite(character);
  if (sqlite != null) return sqlite;
  const dict = await ensureKanjiLoaded();
  return character in dict;
}

export async function isKnownWord(word: string): Promise<boolean> {
  return (await lookupWordFlexible(word)) !== null;
}

/**
 * Greedy longest-match tokenizer against the dictionary.
 * Returns distinct dictionary words found in the sentence, in order of appearance.
 */
export async function tokenizeSentenceWords(sentence: string): Promise<WordInfo[]> {
  const clean = sentence.replace(/\*\*/g, '').trim();
  if (!clean) return [];

  const MAX_LEN = 8;
  const chars = Array.from(clean);

  const allSubstrings = new Set<string>();
  for (let i = 0; i < chars.length; i++) {
    for (let len = 2; len <= MAX_LEN && i + len <= chars.length; len++) {
      allSubstrings.add(chars.slice(i, i + len).join(''));
    }
  }

  const batchResult = await lookupWordBatch(Array.from(allSubstrings));

  const result: WordInfo[] = [];
  const seen = new Set<string>();
  let i = 0;

  while (i < chars.length) {
    let matched: WordInfo | null = null;
    let matchLen = 0;

    for (let len = Math.min(MAX_LEN, chars.length - i); len >= 2; len--) {
      const substr = chars.slice(i, i + len).join('');
      const info = batchResult.get(substr);
      if (info) {
        matched = info;
        matchLen = len;
        break;
      }
    }

    if (matched && !seen.has(matched.word)) {
      seen.add(matched.word);
      result.push(matched);
      i += matchLen;
    } else {
      i += matched ? matchLen : 1;
    }
  }

  return result;
}

/**
 * Batch lookup for multiple kanji characters.
 * Returns a map of character -> KanjiInfo (normalized readings).
 * Missing characters are not included in the map.
 */
export async function lookupKanjiBatch(characters: string[]): Promise<Map<string, KanjiInfo>> {
  const results = new Map<string, KanjiInfo>();
  if (!characters.length) return results;

  // Try SQLite batch first
  const sqliteMap = await lookupKanjiBatchSqlite(characters);
  const remaining: string[] = [];

  if (sqliteMap) {
    for (const ch of characters) {
      const row = sqliteMap.get(ch);
      if (row) {
        const onyomi = (JSON.parse(row.onyomi_json ?? '[]') as string[]).map(normalizeReading).filter(Boolean);
        const kunyomi = (JSON.parse(row.kunyomi_json ?? '[]') as string[]).map(normalizeReading).filter(Boolean);
        const meanings = JSON.parse(row.meanings_json ?? '[]') as string[];
        results.set(ch, { character: ch, readings: { onyomi, kunyomi }, meanings });
      } else {
        remaining.push(ch);
      }
    }
  } else {
    remaining.push(...characters);
  }

  // JSON fallback for anything not found in SQLite
  if (remaining.length) {
    const dict = await ensureKanjiLoaded();
    for (const ch of remaining) {
      const data = dict[ch];
      if (data) {
        results.set(ch, {
          character: ch,
          readings: {
            onyomi: data.readings.onyomi.map(normalizeReading).filter(Boolean),
            kunyomi: data.readings.kunyomi.map(normalizeReading).filter(Boolean),
          },
          meanings: data.meanings,
        });
      }
    }
  }

  return results;
}

/**
 * Batch lookup for multiple words.
 * Returns a map of word -> WordInfo.
 * Missing words are not included in the map.
 */
export async function lookupWordBatch(words: string[]): Promise<Map<string, WordInfo>> {
  const results = new Map<string, WordInfo>();
  if (!words.length) return results;

  // Try SQLite batch first
  const sqliteMap = await lookupWordBatchSqlite(words);
  const remaining: string[] = [];

  if (sqliteMap) {
    for (const w of words) {
      const row = sqliteMap.get(w);
      if (row) {
        const meaning = JSON.parse(row.meanings_json ?? '[]') as string[];
        const pos = JSON.parse(row.pos_json ?? '[]') as string[];
        if (!isExcludedPos(pos)) {
          results.set(w, { word: row.surface, reading: row.reading, meaning });
        }
      } else {
        remaining.push(w);
      }
    }
  } else {
    remaining.push(...words);
  }

  // JSON fallback for anything not found in SQLite - group by bucket and process in parallel
  if (remaining.length) {
    const byBucket = new Map<string, string[]>();
    for (const w of remaining) {
      const key = bucketKeyForWord(w);
      const arr = byBucket.get(key) ?? [];
      arr.push(w);
      byBucket.set(key, arr);
    }

    // Process buckets in parallel
    await Promise.all(
      Array.from(byBucket.entries()).map(async ([key, wordsInBucket]) => {
        const entries = getWordBucketJson(key);
        if (!entries.length) return;
        for (const w of wordsInBucket) {
          const hit = binarySearchWord(entries, w);
          if (hit) {
            if (!isExcludedPos(hit[3])) {
              results.set(w, { word: w, reading: hit[1], meaning: hit[2] });
            }
          }
        }
      })
    );
  }

  return results;
}

