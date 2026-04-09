import { buildContextExplanationPrompt } from './prompts/contextExplanationPrompt';

export class ContextExplanationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextExplanationError';
  }
}

export interface ContextExplanationResult {
  content: string;
}

export async function generateContextExplanation(
  apiKey: string | null,
  item: { type: 'word' | 'kanji'; text: string; fullOcrText: string }
): Promise<ContextExplanationResult> {
  if (!apiKey) {
    throw new ContextExplanationError('No Gemini API key configured. Please add it in Settings.');
  }

  const prompt = buildContextExplanationPrompt(item);

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
          temperature: 0.4,
          maxOutputTokens: 400,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });
  } catch (error) {
    console.error('Network error during context explanation:', error);
    throw new ContextExplanationError('Network error. Please check your internet connection.');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('Gemini API error:', response.status, errorText);
    if (response.status === 400) {
      throw new ContextExplanationError('Invalid Gemini API key or request. Please verify your key.');
    }
    if (response.status === 403) {
      throw new ContextExplanationError('Gemini API key is not authorized for this request.');
    }
    if (response.status === 429) {
      throw new ContextExplanationError('Gemini API quota exceeded. Please try again later.');
    }
    throw new ContextExplanationError(`Context explanation failed (error ${response.status}).`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch (error) {
    console.error('Failed to parse Gemini response:', error);
    throw new ContextExplanationError('Failed to parse Gemini response.');
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .join('\n')
      .trim() ?? '';

  if (!text) {
    throw new ContextExplanationError('No text returned from Gemini. Please try again.');
  }

  return { content: text };
}
