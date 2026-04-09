export interface MnemonicPromptInput {
  type: 'word' | 'kanji';
  text: string;
  reading?: string | null;
  meaning?: string | null;
}

export function buildMnemonicPrompt(input: MnemonicPromptInput): string {
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
      `This is a single-kanji word. You need to decompose the kanji ${kanjiChars[0]} into components and build a mnemonic.`,
      '',
      'Follow these steps logically (but only output the final result, not the steps):',
      '',
      'Step A: Identify the top-level visual components of the kanji (the largest recognizable pieces that tile it with no overlap).',
      'Step B: For each component, decide — is this component recognizable and meaningful on its own (e.g. 昜, 寺, 百)? If yes, keep it as-is. If it is too abstract or obscure to be memorable, break it down one level further into smaller recognizable pieces.',
      'Step C: Verify that your final list of components, taken together, accounts for every visible part of the kanji. No region of the kanji should be unrepresented.',
      'Step D: Build a mnemonic that references ALL of the listed components. A learner should be able to reconstruct the full kanji from your mnemonic — if any component is missing from the mnemonic, the learner will forget that part of the kanji.',
      '',
      'Output the following in this exact order:',
      '',
      '1. A [RADICALS] section with your final component list. Each on its own line prefixed with "- ". Even if there is only one, still use the [RADICALS] tags. Example:',
      '[RADICALS]',
      '- 宀 (roof) — shelter, building',
      '- 亻 (person) — someone staying',
      '- 百 (hundred) — many, abundance',
      '[/RADICALS]',
      '',
      '2. A brief line about the kanji\'s composition or visual structure.',
      '',
      `3. The mnemonic (1-2 sentences max) wrapped in [MNEMONIC][/MNEMONIC] tags. It MUST reference every component listed above.`,
    );
  } else if (isWord) {
    lines.push(
      'This is a kana word with no kanji. Provide:',
      '',
      `1. The mnemonic (1-2 sentences max) wrapped in [MNEMONIC][/MNEMONIC] tags.`,
    );
  } else {
    lines.push(
      'This is a single kanji. You need to decompose it into components and build a mnemonic.',
      '',
      'Follow these steps logically (but only output the final result, not the steps):',
      '',
      'Step A: Identify the top-level visual components of the kanji (the largest recognizable pieces that tile it with no overlap).',
      'Step B: For each component, decide — is this component recognizable and meaningful on its own (e.g. 昜, 寺, 百)? If yes, keep it as-is. If it is too abstract or obscure to be memorable, break it down one level further into smaller recognizable pieces.',
      'Step C: Verify that your final list of components, taken together, accounts for every visible part of the kanji. No region of the kanji should be unrepresented.',
      'Step D: Build a mnemonic that references ALL of the listed components. A learner should be able to reconstruct the full kanji from your mnemonic — if any component is missing from the mnemonic, the learner will forget that part of the kanji.',
      '',
      'Output the following in this exact order:',
      '',
      '1. A [RADICALS] section with your final component list. Each on its own line prefixed with "- ". Even if there is only one, still use the [RADICALS] tags. Example:',
      '[RADICALS]',
      '- 土 (ground, earth) — location, physical space',
      '- 昜 (sun rising, activity) — brightness, openness',
      '[/RADICALS]',
      '',
      '2. A brief visual or structural observation about its shape (1 line).',
      '',
      '3. The mnemonic (1-2 sentences max) wrapped in [MNEMONIC][/MNEMONIC] tags. It MUST reference every component listed above.',
      '',
      'Do NOT include a pronunciation/reading line. Do NOT list readings at the top.',
    );
  }

  return lines.join('\n');
}
