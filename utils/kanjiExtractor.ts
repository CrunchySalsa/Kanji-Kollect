/**
 * Utility to extract Kanji and Japanese words from OCR text.
 */

// Unicode ranges for Japanese characters
const KANJI_RANGE_START = 0x4e00;
const KANJI_RANGE_END = 0x9faf;
const HIRAGANA_RANGE_START = 0x3040;
const HIRAGANA_RANGE_END = 0x309f;
const KATAKANA_RANGE_START = 0x30a0;
const KATAKANA_RANGE_END = 0x30ff;

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
  const kanjiSet = new Set<string>();
  const wordsSet = new Set<string>();

  // Extract all unique kanji
  for (const char of text) {
    if (isKanji(char)) {
      kanjiSet.add(char);
    }
  }

  // Extract compound words (2+ kanji in sequence, potentially with okurigana)
  // Pattern: 2+ kanji characters, optionally followed by hiragana
  const compoundPattern = /[\u4e00-\u9faf]{2,}[\u3040-\u309f]*/g;
  const matches = text.match(compoundPattern);
  
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
  
  for (const char of text) {
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

  const extracted = extractKanjiAndWords(text).words;
  for (const w of extracted) {
    if (!w) continue;
    // Escape for regex
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'g');
    const matches = text.match(re);
    const n = matches ? matches.length : 0;
    if (n > 0) counts.set(w, n);
  }

  return counts;
}

/**
 * Extract kanji/words plus occurrence counts.
 */
export function extractKanjiAndWordsWithCounts(text: string): ExtractionWithCountsResult {
  const base = extractKanjiAndWords(text);

  const kanjiCounts: Record<string, number> = {};
  for (const [k, n] of countKanjiOccurrences(text).entries()) {
    kanjiCounts[k] = n;
  }

  const wordCounts: Record<string, number> = {};
  for (const [w, n] of countWordOccurrences(text).entries()) {
    wordCounts[w] = n;
  }

  return {
    ...base,
    kanjiCounts,
    wordCounts,
  };
}

