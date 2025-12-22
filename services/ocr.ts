import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

/**
 * Custom error class for OCR-related errors.
 */
export class OcrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrError';
  }
}

/**
 * Process an image and extract Japanese text using OCR.
 * Uses Google Cloud Vision API.
 * 
 * @param imageUri - Local file URI of the image
 * @param apiKey - Google Cloud Vision API key
 * @param isHandwritten - Whether the image contains handwritten text (unused, kept for API compatibility)
 * @returns Extracted text from the image
 * @throws {OcrError} When OCR fails or API key is missing
 */
export async function processImage(imageUri: string, apiKey: string | null, _isHandwritten: boolean = false): Promise<string> {
  if (!apiKey) {
    throw new OcrError('No API key configured. Please add your Google Cloud Vision API key in Settings.');
  }

  return await tryCloudOcr(imageUri, apiKey);
}

/**
 * Attempt OCR using Google Cloud Vision API.
 */
async function tryCloudOcr(imageUri: string, apiKey: string): Promise<string> {
  // Read image as base64
  let base64Image: string;
  try {
    base64Image = await readAsStringAsync(imageUri, {
      encoding: EncodingType.Base64,
    });
  } catch (error) {
    console.error('Failed to read image:', error);
    throw new OcrError('Failed to read the image file.');
  }

  let response: Response;
  try {
    response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [{ type: 'TEXT_DETECTION' }],
              imageContext: {
                languageHints: ['ja'],
              },
            },
          ],
        }),
      }
    );
  } catch (error) {
    console.error('Network error during OCR:', error);
    throw new OcrError('Network error. Please check your internet connection.');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('Cloud Vision API error:', response.status, errorText);
    
    if (response.status === 400) {
      throw new OcrError('Invalid API key or request. Please check your API key in Settings.');
    } else if (response.status === 403) {
      throw new OcrError('API key is not authorized. Enable Cloud Vision API in Google Cloud Console.');
    } else if (response.status === 429) {
      throw new OcrError('API quota exceeded. Please try again later.');
    } else {
      throw new OcrError(`OCR failed (error ${response.status}). Please try again.`);
    }
  }

  let data: any;
  try {
    data = await response.json();
  } catch (error) {
    console.error('Failed to parse OCR response:', error);
    throw new OcrError('Failed to parse OCR response.');
  }

  // Check for API-level errors in the response
  const apiError = data.responses?.[0]?.error;
  if (apiError) {
    console.error('Vision API returned error:', apiError);
    throw new OcrError(apiError.message || 'OCR processing failed.');
  }

  const text = data.responses?.[0]?.fullTextAnnotation?.text ?? '';
  return text;
}

/**
 * Check if cloud OCR is available (API key is provided).
 */
export function isCloudOcrAvailable(apiKey: string | null): boolean {
  return !!apiKey && apiKey.length > 0;
}
