import { toRomaji } from 'wanakana';
import { getPreference, setPreference } from '../utils/preferences';

export type ContextCacheEntry = {
  sentence: string;
  romaji: string;
  explanation: string;
  words?: Array<{ word: string; reading: string }>;
};

const CONTEXT_CACHE_KEY = 'contextExplanationCache';

export type ContextCache = Record<string, ContextCacheEntry>;

export async function loadContextCache(): Promise<ContextCache> {
  const raw = await getPreference(CONTEXT_CACHE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ContextCache;
  } catch {
    return {};
  }
}

export async function saveContextCacheEntry(key: string, entry: ContextCacheEntry): Promise<void> {
  const cache = await loadContextCache();
  cache[key] = entry;
  await setPreference(CONTEXT_CACHE_KEY, JSON.stringify(cache));
}

function stripMarkdownArtifacts(text: string, keepBold = false): string {
  let result = text;
  if (!keepBold) result = result.replace(/\*\*(.+?)\*\*/g, '$1');
  result = result
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<![*\w])\*([^*]+)\*(?![*\w])/g, '$1')
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '');
  return result;
}

function stripContextTags(text: string): string {
  return text.replace(/\[\/?(?:SENTENCE|ROMAJI|EXPLANATION|WORDS)\]/g, '').trim();
}

function parseWordsSection(raw: string): Array<{ word: string; reading: string }> {
  const wordsMatch = raw.match(/\[WORDS\]([\s\S]*?)\[\/WORDS\]/);
  if (!wordsMatch) return [];
  const lines = wordsMatch[1]
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const results: Array<{ word: string; reading: string }> = [];
  for (const line of lines) {
    const m = line.match(/^(.+?)\s*[(\uff08](.+?)[)\uff09]\s*$/);
    if (m) {
      results.push({ word: m[1].trim(), reading: m[2].trim() });
    } else {
      const cleaned = line.replace(/^[-•]\s*/, '').trim();
      if (cleaned) results.push({ word: cleaned, reading: '' });
    }
  }
  return results;
}

export function parseContextResponse(raw: string): ContextCacheEntry {
  const sentenceMatch = raw.match(/\[SENTENCE\]([\s\S]*?)\[\/SENTENCE\]/);
  const romajiMatch = raw.match(/\[ROMAJI\]([\s\S]*?)\[\/ROMAJI\]/);
  const explanationMatch = raw.match(/\[EXPLANATION\]([\s\S]*?)\[\/EXPLANATION\]/);

  let sentence = sentenceMatch ? sentenceMatch[1].trim() : '';
  let romaji = romajiMatch ? romajiMatch[1].trim() : '';
  let explanation = explanationMatch ? explanationMatch[1].trim() : '';

  if (!sentence && !explanation) {
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    sentence = lines[0] ?? '';
    explanation = lines.slice(1).join('\n');
  }

  if (!romaji && sentence) {
    romaji = toRomaji(sentence.replace(/\*\*/g, '')).trim();
  }

  return {
    sentence: stripContextTags(stripMarkdownArtifacts(sentence, true)),
    romaji: stripContextTags(stripMarkdownArtifacts(romaji, true)),
    explanation: stripContextTags(stripMarkdownArtifacts(explanation, true)),
    words: parseWordsSection(raw),
  };
}
