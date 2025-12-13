/**
 * Offline dictionary service.
 *
 * Uses generated JSON files in `assets/dictionaries/` built by:
 *   `node scripts/build_dictionaries.mjs`
 */

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
type WordEntryTuple = readonly [string, string, string[]]; // [surface, reading, meanings]

let kanjiDict: KanjiDict | null = null;
let wordBucketsLoaded = false;
let WORD_BUCKETS: Record<string, readonly WordEntryTuple[]> | null = null;

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

async function ensureWordBuckets(): Promise<Record<string, readonly WordEntryTuple[]>> {
  if (!wordBucketsLoaded) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./generated/wordBuckets') as { WORD_BUCKETS: Record<string, readonly WordEntryTuple[]> };
    WORD_BUCKETS = mod.WORD_BUCKETS;
    wordBucketsLoaded = true;
  }
  return WORD_BUCKETS ?? {};
}

export async function lookupKanji(character: string): Promise<KanjiInfo | null> {
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
  const buckets = await ensureWordBuckets();
  const key = bucketKeyForWord(word);
  const entries = buckets[key] ?? [];
  if (!entries.length) return null;
  const hit = binarySearchWord(entries, word);
  if (!hit) return null;
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
  const buckets = await ensureWordBuckets();
  const key = bucketKeyForWord(prefix);
  const entries = buckets[key] ?? [];
  if (!entries.length) return null;

  const start = lowerBound(entries, prefix);
  const maxScan = 80;
  const candidates: WordEntryTuple[] = [];
  for (let i = start; i < entries.length && candidates.length <= maxScan; i++) {
    const surface = entries[i][0];
    if (!surface.startsWith(prefix)) break;
    const remainder = surface.slice(prefix.length);
    // Prefer "added okurigana" style completions to avoid matching longer compound kanji strings.
    if (!remainder || isAllHiragana(remainder)) candidates.push(entries[i]);
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
  const dict = await ensureKanjiLoaded();
  return character in dict;
}

export async function isKnownWord(word: string): Promise<boolean> {
  return (await lookupWordFlexible(word)) !== null;
}

