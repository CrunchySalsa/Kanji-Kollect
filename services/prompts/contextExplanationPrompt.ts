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
    'Output format — you MUST use the exact tags shown below, plain text only, no markdown:',
    '',
    '[SENTENCE]',
    'The relevant Japanese sentence or phrase from the OCR text that contains or relates to the target. Just the Japanese text, nothing else. This must be a single line.',
    '[/SENTENCE]',
    '',
    '[ROMAJI]',
    'The full romaji transliteration of the SENTENCE above. You MUST always include this section — never omit it. Single line, standard Hepburn romanization.',
    '[/ROMAJI]',
    '',
    '[EXPLANATION]',
    'Your concise English explanation (2-4 sentences).',
    '[/EXPLANATION]',
  ];

  return lines.join('\n');
}
