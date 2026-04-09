import { buildMnemonicPrompt } from './prompts/mnemonicPrompt';

export class MnemonicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MnemonicError';
  }
}

export interface MnemonicResult {
  content: string;
}

export async function generateMnemonic(
  apiKey: string | null,
  item: { type: 'word' | 'kanji'; text: string; reading?: string | null; meaning?: string | null }
): Promise<MnemonicResult> {
  if (!apiKey) {
    throw new MnemonicError('No Gemini API key configured. Please add it in Settings.');
  }

  const { prompt, needsThinking } = buildMnemonicPrompt(item);

  let response: Response;
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: needsThinking ? 0.5 : 0.9,
          maxOutputTokens: needsThinking ? 4096 : 300,
          thinkingConfig: {
            thinkingBudget: needsThinking ? 2048 : 0,
          },
        },
      }),
    });
  } catch (error) {
    console.error('Network error during mnemonic generation:', error);
    throw new MnemonicError('Network error. Please check your internet connection.');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('Gemini API error:', response.status, errorText);
    if (response.status === 400) {
      throw new MnemonicError('Invalid Gemini API key or request. Please verify your key.');
    }
    if (response.status === 403) {
      throw new MnemonicError('Gemini API key is not authorized for this request.');
    }
    if (response.status === 429) {
      throw new MnemonicError('Gemini API quota exceeded. Please try again later.');
    }
    throw new MnemonicError(`Mnemonic generation failed (error ${response.status}).`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch (error) {
    console.error('Failed to parse Gemini response:', error);
    throw new MnemonicError('Failed to parse Gemini response.');
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.filter((p: any) => !p.thought)
      .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .join('\n')
      .trim() ?? '';

  if (!text) {
    throw new MnemonicError('No text returned from Gemini. Please try again.');
  }

  return { content: text };
}
