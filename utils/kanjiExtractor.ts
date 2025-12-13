/**
 * Utility to extract Kanji and Japanese words from OCR text.
 */

import { lookupWord } from '../services/dictionary';

// Unicode ranges for Japanese characters
const KANJI_RANGE_START = 0x4e00;
const KANJI_RANGE_END = 0x9faf;
const HIRAGANA_RANGE_START = 0x3040;
const HIRAGANA_RANGE_END = 0x309f;
const KATAKANA_RANGE_START = 0x30a0;
const KATAKANA_RANGE_END = 0x30ff;

/**
 * Normalize OCR / document-extracted text so that Japanese word detection works even when
 * the source inserts whitespace between characters (common in PDF text extraction and some OCR).
 *
 * Example:
 *   "新 宿 日 本 語 学 園" -> "新宿日本語学園"
 *   "大 嫌 い" -> "大嫌い"
 */
function normalizeJapaneseSpacing(text: string): string {
  if (!text) return text;
  // Treat full-width space and NBSP as whitespace for our purposes.
  let out = text.replace(/[\u00a0\u3000]/g, ' ');
  // Remove whitespace that occurs BETWEEN Japanese characters (kanji/kana).
  // Note: avoids lookbehind for Hermes compatibility.
  out = out.replace(/([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf])[\s]+(?=[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf])/g, '$1');
  return out;
}

/**
 * Check if a character is a Kanji.
 */
export function isKanji(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= KANJI_RANGE_START && code <= KANJI_RANGE_END;
}

/**
 * Check if a character is Hiragana.
 */
export function isHiragana(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= HIRAGANA_RANGE_START && code <= HIRAGANA_RANGE_END;
}

/**
 * Check if a character is Katakana.
 */
export function isKatakana(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= KATAKANA_RANGE_START && code <= KATAKANA_RANGE_END;
}

/**
 * Check if a character is any Japanese script (Kanji, Hiragana, or Katakana).
 */
export function isJapanese(char: string): boolean {
  return isKanji(char) || isHiragana(char) || isKatakana(char);
}

interface ExtractionResult {
  kanji: string[];
  words: string[];
}

export interface ExtractionWithCountsResult extends ExtractionResult {
  kanjiCounts: Record<string, number>;
  wordCounts: Record<string, number>;
}

function stripTrailingParticles(word: string): string {
  // Strip common particles/connectors at the very end, but keep okurigana (e.g. "見直す" should stay).
  // Intended for OCR cases like "電車は" -> "電車".
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

function normalizeExtractedWord(word: string): string {
  return stripTrailingParticles(word);
}

/**
 * Extract unique Kanji characters and compound words from OCR text.
 * 
 * Kanji: Each unique Kanji character found in the text.
 * Words: Sequences of 2+ Kanji, optionally with trailing Hiragana (okurigana).
 */
export function extractKanjiAndWords(text: string): ExtractionResult {
  const normalizedText = normalizeJapaneseSpacing(text);
  const kanjiSet = new Set<string>();
  const wordsSet = new Set<string>();

  // Extract all unique kanji
  for (const char of normalizedText) {
    if (isKanji(char)) {
      kanjiSet.add(char);
    }
  }

  // Extract compound words (2+ kanji in sequence, potentially with okurigana)
  // Pattern: 2+ kanji characters, optionally followed by hiragana
  const compoundPattern = /[\u4e00-\u9faf]{2,}[\u3040-\u309f]*/g;
  const matches = normalizedText.match(compoundPattern);
  
  if (matches) {
    for (const match of matches) {
      // Only add if it's primarily kanji (not just okurigana)
      const kanjiInWord = match.split('').filter(isKanji).length;
      if (kanjiInWord >= 2) {
        const normalized = normalizeExtractedWord(match);
        // Keep only 2+ kanji words after normalization (avoid duplicating the kanji list).
        const normalizedKanji = normalized.split('').filter(isKanji).length;
        if (normalizedKanji >= 2) {
          wordsSet.add(normalized);
        }
      }
    }
  }

  return {
    kanji: Array.from(kanjiSet),
    words: Array.from(wordsSet).filter(Boolean),
  };
}

/**
 * Count occurrences of each Kanji in the text.
 */
export function countKanjiOccurrences(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  const normalizedText = normalizeJapaneseSpacing(text);
  
  for (const char of normalizedText) {
    if (isKanji(char)) {
      counts.set(char, (counts.get(char) || 0) + 1);
    }
  }
  
  return counts;
}

/**
 * Count occurrences of extracted words in the text.
 * Uses the same extraction patterns as `extractKanjiAndWords`.
 */
export function countWordOccurrences(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  const normalizedText = normalizeJapaneseSpacing(text);

  const extracted = extractKanjiAndWords(normalizedText).words;
  for (const w of extracted) {
    if (!w) continue;
    // Escape for regex
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'g');
    const matches = normalizedText.match(re);
    const n = matches ? matches.length : 0;
    if (n > 0) counts.set(w, n);
  }

  return counts;
}

/**
 * Extract kanji/words plus occurrence counts.
 */
export function extractKanjiAndWordsWithCounts(text: string): ExtractionWithCountsResult {
  const normalizedText = normalizeJapaneseSpacing(text);
  const base = extractKanjiAndWords(normalizedText);

  const kanjiCounts: Record<string, number> = {};
  for (const [k, n] of countKanjiOccurrences(normalizedText).entries()) {
    kanjiCounts[k] = n;
  }

  const wordCounts: Record<string, number> = {};
  for (const [w, n] of countWordOccurrences(normalizedText).entries()) {
    wordCounts[w] = n;
  }

  return {
    ...base,
    kanjiCounts,
    wordCounts,
  };
}

function isAllKanji(word: string): boolean {
  return !!word && /^[\u4e00-\u9faf]+$/.test(word);
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countOccurrencesForWords(text: string, words: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of words) {
    if (!w) continue;
    const re = new RegExp(escapeForRegex(w), 'g');
    const matches = text.match(re);
    const n = matches ? matches.length : 0;
    if (n > 0) out[w] = n;
  }
  return out;
}

type SplitCandidate = { segmentsCount: number; maxLen: number; score: number; parts: string[] };

function betterSplit(a: SplitCandidate, b: SplitCandidate): boolean {
  // Prefer fewer segments. If tied, prefer longer segments (higher sum of squares).
  if (a.segmentsCount !== b.segmentsCount) return a.segmentsCount < b.segmentsCount;
  // Explicitly prefer the solution that contains the largest chunk.
  if (a.maxLen !== b.maxLen) return a.maxLen > b.maxLen;
  if (a.score !== b.score) return a.score > b.score;
  // Stable tie-breaker: prefer the one with a longer first segment (if any).
  const a0 = a.parts[0]?.length ?? 0;
  const b0 = b.parts[0]?.length ?? 0;
  return a0 > b0;
}

async function splitIntoKnownWordsKanjiOnly(
  word: string,
  isKnown: (w: string) => Promise<boolean>,
  minSegmentLength: number
): Promise<string[] | null> {
  const n = word.length;
  const dp: Array<SplitCandidate | null> = new Array(n + 1).fill(null);
  dp[0] = { segmentsCount: 0, maxLen: 0, score: 0, parts: [] };

  for (let i = 0; i < n; i++) {
    const cur = dp[i];
    if (!cur) continue;
    for (let j = i + minSegmentLength; j <= n; j++) {
      const seg = word.slice(i, j);
      if (!(await isKnown(seg))) continue;
      const segLen = seg.length;
      const cand: SplitCandidate = {
        segmentsCount: cur.segmentsCount + 1,
        maxLen: Math.max(cur.maxLen, segLen),
        score: cur.score + segLen * segLen,
        parts: [...cur.parts, seg],
      };
      const existing = dp[j];
      if (!existing || betterSplit(cand, existing)) dp[j] = cand;
    }
  }

  const best = dp[n];
  if (!best || best.parts.length < 2) return null;
  return best.parts;
}

/**
 * Like `extractKanjiAndWordsWithCounts`, but attempts to split kanji-only OCR "clumps"
 * into known dictionary words when the clump itself is unknown (e.g. "注文依頼" -> ["注文","依頼"]).
 *
 * Notes:
 * - Splitting is attempted only when the original token is NOT an exact dictionary headword.
 * - The DP splitter is safe for mixed tokens too (e.g. "...合せ"), despite the helper name.
 * - Unknown tokens are NOT kept (they must not be persisted as "words").
 */
export async function extractKanjiAndWordsWithCountsSmart(text: string): Promise<ExtractionWithCountsResult> {
  const normalizedText = normalizeJapaneseSpacing(text);
  const base = extractKanjiAndWords(normalizedText);

  // Cache dictionary lookups within this run.
  const knownCache = new Map<string, boolean>();
  const isKnown = async (w: string): Promise<boolean> => {
    if (!w) return false;
    const cached = knownCache.get(w);
    if (cached !== undefined) return cached;
    const hit = await lookupWord(w);
    const ok = hit !== null;
    knownCache.set(w, ok);
    return ok;
  };

  const finalWordsSet = new Set<string>();
  for (const w of base.words) {
    if (!w) continue;

    if (await isKnown(w)) {
      finalWordsSet.add(w);
      continue;
    }

    // Try to split into known dictionary words (minimum 2 chars each, to avoid 1-char fragments).
    const split = await splitIntoKnownWordsKanjiOnly(w, isKnown, 2);
    if (split) {
      for (const part of split) finalWordsSet.add(part);
      continue;
    }
    // Unknown and unsplittable: drop.
  }

  const words = Array.from(finalWordsSet).filter(Boolean);

  const kanjiCounts: Record<string, number> = {};
  for (const [k, n] of countKanjiOccurrences(normalizedText).entries()) {
    kanjiCounts[k] = n;
  }

  const wordCounts = countOccurrencesForWords(normalizedText, words);

  return {
    kanji: base.kanji,
    words,
    kanjiCounts,
    wordCounts,
  };
}

