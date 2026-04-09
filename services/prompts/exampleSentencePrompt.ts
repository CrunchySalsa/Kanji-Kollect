export interface ExampleSentencePromptInput {
  type: 'word' | 'kanji';
  text: string;
  reading?: string | null;
  meaning?: string | null;
}

export function buildExampleSentencePrompt(input: ExampleSentencePromptInput): string {
  const lines: string[] = [
    `You are a Japanese language study assistant. Given a ${input.type}, produce a study card in the exact format below.`,
    '',
    `Target ${input.type}: ${input.text}`,
  ];

  if (input.reading) lines.push(`Known reading: ${input.reading}`);
  if (input.meaning) lines.push(`Known meaning: ${input.meaning}`);

  lines.push(
    '',
    'Output format (follow exactly, plain text, no markdown except double asterisks around the target word):',
    '',
    'IMPORTANT: Every time the target word appears in the output (in ALL sections — definition, comparison, AND example sentences), wrap it in double asterisks like **word**. Do NOT wrap any other words in asterisks.',
    '',
    'Line 1: The target word (wrapped in **) with its reading in hiragana and romaji in parentheses, then "means" followed by a concise definition and brief context of when/how it is used. All on one line.',
    '',
    'Line 2: (blank line)',
    '',
    'Line 3+: If similar words exist that learners commonly confuse with this one, write one or two sentences comparing them. Mention each similar word with its reading in parentheses. If no meaningful comparison exists, omit this section entirely — do NOT write a line saying there are no similar words or that comparison is unnecessary.',
    '',
    'Next blank line, then exactly three lines:',
    'Line A: An example sentence in Japanese (natural, modern, useful real-world context). The target word must appear wrapped in **.',
    'Line B: The same sentence in romaji. The target word in romaji must also be wrapped in **.',
    'Line C: The English translation.',
    '',
    'Example of correct output for 使用:',
    '',
    '**使用**（しよう / shiyō） means "use" and is formal, often seen in instructions, manuals, or official contexts.',
    '',
    'Compared to 使う (tsukau), **使用** sounds more technical and impersonal. Compared to 利用 (riyō), which implies making practical use of a service or system, **使用** focuses more on the act of using something itself.',
    '',
    'パスワードは他人と共有せず、安全に**使用**してください。',
    'Pasuwādo wa tanin to kyōyū sezu, anzen ni **shiyō** shite kudasai.',
    'Do not share your password with others; use it safely.',
    '',
    'Now produce the study card for the target above.',
  );

  return lines.join('\n');
}
