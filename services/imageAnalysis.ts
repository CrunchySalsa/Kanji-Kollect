import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { buildImageAnalysisPrompt } from './prompts/imageAnalysisPrompt';

export class ImageAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageAnalysisError';
  }
}

export async function analyzeImage(
  apiKey: string,
  imageUri: string
): Promise<string> {
  let base64Image: string;
  try {
    base64Image = await readAsStringAsync(imageUri, {
      encoding: EncodingType.Base64,
    });
  } catch (error) {
    console.error('Failed to read image for analysis:', error);
    throw new ImageAnalysisError('Failed to read the image file.');
  }

  const prompt = buildImageAnalysisPrompt();

  let response: Response;
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 400,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });
  } catch (error) {
    console.error('Network error during image analysis:', error);
    throw new ImageAnalysisError('Network error. Please check your internet connection.');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('Gemini API error:', response.status, errorText);
    if (response.status === 400) {
      throw new ImageAnalysisError('Invalid Gemini API key or request. Please verify your key.');
    }
    if (response.status === 403) {
      throw new ImageAnalysisError('Gemini API key is not authorized for this request.');
    }
    if (response.status === 429) {
      throw new ImageAnalysisError('Gemini API quota exceeded. Please try again later.');
    }
    throw new ImageAnalysisError(`Image analysis failed (error ${response.status}).`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch (error) {
    console.error('Failed to parse Gemini response:', error);
    throw new ImageAnalysisError('Failed to parse Gemini response.');
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .join('\n')
      .trim() ?? '';

  if (!text) {
    throw new ImageAnalysisError('No analysis returned from Gemini. Please try again.');
  }

  return text;
}
