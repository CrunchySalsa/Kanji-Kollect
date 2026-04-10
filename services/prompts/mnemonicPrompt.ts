export interface MnemonicPromptInput {
  type: 'word' | 'kanji';
  text: string;
  reading?: string | null;
  meaning?: string | null;
}

export interface MnemonicPromptOutput {
  prompt: string;
  needsThinking: boolean;
}

export function buildMnemonicPrompt(input: MnemonicPromptInput): MnemonicPromptOutput {
  const isWord = input.type === 'word';
  const kanjiChars = Array.from(input.text).filter(ch => /[\u3400-\u4DBF\u4E00-\u9FFF\u3005]/.test(ch));
  const hasMultipleKanji = isWord && kanjiChars.length > 1;
  const hasSingleKanji = isWord && kanjiChars.length === 1;

  const lines: string[] = [
    `You are a Japanese language mnemonic assistant helping English-speaking learners remember ${isWord ? 'vocabulary words' : 'kanji'}.`,
    '',
    `Target: ${input.text}`,
  ];

  if (input.reading) lines.push(`Reading: ${input.reading}`);
  if (input.meaning) lines.push(`Meaning: ${input.meaning}`);

  lines.push(
    '',
    'IMPORTANT formatting rules that apply to ALL output:',
    '- All parenthetical readings must be in romaji, NEVER hiragana. Example: (ba) not (ば), (shuku) not (しゅく).',
    '- Output plain text only. No markdown headers, no asterisks, no underscores.',
    '- If you want to emphasize a word or phrase, wrap it in [B] and [/B] tags like [B]this[/B].',
    '- Do NOT recap or summarize after the mnemonic.',
    '- You MUST always wrap the final mnemonic in [MNEMONIC] and [/MNEMONIC] tags. The mnemonic must be the very last thing in the output.',
    '- Do NOT fabricate or guess radicals/components. Only list components you are confident are correct. If a kanji has no meaningful sub-components (e.g. it is itself a primitive/radical), omit the [RADICALS] section entirely.',
    '- Keep mnemonics practical and conceptual. Do not try to rhyme or make puns.',
    '- The mnemonic can use visual impressions of the kanji shape when that is more intuitive than the literal radicals. For example, 品 is technically three 口 (mouth) radicals, but it looks like three boxes/packages stacked together, which connects more naturally to "goods/products." Prefer whichever framing — literal radicals or visual impression — makes the meaning more memorable.',
    '',
  );

  if (isWord && hasMultipleKanji) {
    lines.push(
      'This is a multi-kanji word. Provide the following in this exact order:',
      '',
      '1. FIRST, a [RADICALS] section listing each kanji in the word. Each kanji on its own line prefixed with "- ", showing the character and its core meaning. You MUST include EVERY kanji in the word. Example:',
      '[RADICALS]',
      '- 世 (world, generation)',
      '- 話 (talk, story)',
      '[/RADICALS]',
      '',
      '2. A breakdown line showing the kanji meanings combined:',
      '   漢 (meaning) + 字 (meaning) → "combined concept"',
      '',
      `3. The mnemonic (1-2 sentences max) wrapped in [MNEMONIC][/MNEMONIC] tags.`,
    );
  } else if (isWord && hasSingleKanji) {
    lines.push(
      `This is a single-kanji word. Give the radical breakdown of the kanji ${kanjiChars[0]}. Break it into its main structural components (left/right, top/bottom, inner/outer). Do not go too many levels deep — just identify the major recognizable pieces that make up the character, then use those to build a mnemonic.`,
      '',
      'Guidelines for decomposition:',
      '- Stick to the 214 Kangxi radicals and widely-recognized kanji components. Do NOT invent or guess components.',
      '- Prefer fewer accurate components over many uncertain ones.',
      '- Name each component with its standard radical name and meaning.',
      '',
      'Here is an example of a correct decomposition and mnemonic for the kanji 語 (language):',
      '',
      '[RADICALS]',
      '- 言 (speech, words) — the speech radical on the left',
      '- 五 (five) — the upper-right portion',
      '- 口 (mouth) — the lower-right portion',
      '[/RADICALS]',
      'This kanji combines speech (言) with five (五) and mouth (口) on the right.',
      '[MNEMONIC]',
      'A [B]mouth[/B] that speaks [B]five[/B] different [B]words[/B] — that is [B]language[/B].',
      '[/MNEMONIC]',
      '',
      'Now do the same for the target kanji. Output the following in this exact order:',
      '',
      '1. A [RADICALS] section with your component list. Each on its own line prefixed with "- ". Even if there is only one, still use the [RADICALS] tags.',
      '',
      '2. A brief line about the kanji\'s composition or visual structure.',
      '',
      `3. The mnemonic (1-2 sentences max) wrapped in [MNEMONIC][/MNEMONIC] tags. It MUST parenthetically reference every component listed above, but do not regurgitate section 2.`,
      '- This section may reference the components for their meaning and/or their appearance, whichever suits the mnemonic best.',
    );
  } else if (isWord) {
    lines.push(
      'This is a kana word with no kanji. Provide:',
      '',
      `1. The mnemonic (1-2 sentences max) wrapped in [MNEMONIC][/MNEMONIC] tags.`,
    );
  } else {
    lines.push(
      'This is a single kanji. Give the radical breakdown — break it into its main structural components (left/right, top/bottom, inner/outer). Do not go too many levels deep — just identify the major recognizable pieces that make up the character, then use those to build a mnemonic.',
      '',
      'Guidelines for decomposition:',
      '- Prioritize accuracy when listing radicals and sub-components of the kanji in question. Refer to established sources for knowledge about the actual components within the actual kanji in question. Do NOT invent or guess components.',
      '- Prefer fewer accurate mnemonically relevant components over arbitrarily breaking down into several smaller ones that do not contribute to the mnemonic.',
      '- Name each component with its standard radical name and meaning.',
      '',
      'Output the following in this exact order:',
      '',
      '1. A [RADICALS][/RADICALS] section with your component list. Each on its own line prefixed with "- ".',
      '- Even if there is only one, still use the [RADICALS][/RADICALS] tags.',
      '- Be sure to include ALL radicals that you plan to reference in the mnemonic.',
      '',
      '2. A brief visual or structural observation about its shape (1 line).',
      '',
      '3. The mnemonic (1-2 sentences max) wrapped in [MNEMONIC][/MNEMONIC] tags. It MUST parenthetically reference every component listed above, but do not regurgitate section 2.',
      '- This section may reference the components for their meaning and/or their appearance, whichever suits the mnemonic best.',
      '',
      'Do NOT include a pronunciation/reading line. Do NOT list readings at the top.',
    );
  }

  const needsThinking = !isWord || hasSingleKanji;

  return { prompt: lines.join('\n'), needsThinking };
}
