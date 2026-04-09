export interface ContextExplanationPromptInput {
  type: 'word' | 'kanji';
  text: string;
  fullOcrText: string;
}

export function buildContextExplanationPrompt(input: ContextExplanationPromptInput): string {
  const lines: string[] = [
    `You are a Japanese language assistant. A learner took a photo containing Japanese text, and OCR was run on it. The learner wants to understand how a specific ${input.type} was being used in context.`,
    '',
    `Target ${input.type}: ${input.text}`,
    '',
    'Full OCR text from the image:',
    '---',
    input.fullOcrText,
    '---',
    '',
    'Instructions:',
    `- Find the sentence(s) or phrase(s) in the OCR text where "${input.text}" appears or is most relevant.`,
    '- The OCR text may contain multiple unrelated text blocks (e.g. from signs, labels, or background text in the same photo). Focus ONLY on the text block(s) that contain or are contextually related to the target. Ignore unrelated text.',
    `- Provide a concise explanation of what "${input.text}" means in this specific context and how it is being used.`,
    '- If relevant, mention the grammatical role or any nuance specific to this usage.',
    '- Keep the explanation brief: 2-4 sentences.',
    '',
    `IMPORTANT — highlighting rules for ** markers:`,
    `- In the SENTENCE, ROMAJI, and EXPLANATION sections, wrap ONLY the target ${input.type} in double asterisks.`,
    input.type === 'kanji'
      ? `- Since the target is a single kanji, wrap ONLY that one character: e.g. if target is 食, write **食**べる, NOT **食べる**.`
      : `- Wrap only the target word itself (its stem/conjugated form), not surrounding particles or other words: e.g. if target is 食べる and sentence uses 食べました, write **食べ**ました, NOT **食べました**.`,
    '- Do NOT wrap any other words, translations, or phrases in **.',
    '',
    'Output format — you MUST use the exact tags shown below, plain text only, no markdown except the double asterisks around the target:',
    '',
    '[SENTENCE]',
    'The relevant Japanese sentence or phrase from the OCR text. Single line, Japanese only. Wrap the target in ** per the rules above.',
    '[/SENTENCE]',
    '',
    '[ROMAJI]',
    'Full romaji transliteration of the SENTENCE. You MUST always include this. Single line, Hepburn romanization. Wrap the romaji of the target in **.',
    '[/ROMAJI]',
    '',
    '[EXPLANATION]',
    'Concise English explanation (2-4 sentences). Wrap the target in ** when it appears.',
    '[/EXPLANATION]',
    '',
    '[WORDS]',
    'List the individual words/tokens in the SENTENCE, one per line. Format each line as: word (reading)',
    'Include all content words (nouns, verbs, adjectives, adverbs, names). Exclude particles (は, が, を, に, etc.) and pure grammatical endings.',
    'Keep compound words and proper nouns as single entries (e.g. 東放学園 (とうほうがくえん), not split into 東放 and 学園).',
    'Use dictionary/base form for verbs and adjectives when possible (e.g. 食べる not 食べました).',
    '[/WORDS]',
  ];

  return lines.join('\n');
}
