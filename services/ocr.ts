import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

/**
 * Process an image and extract Japanese text using OCR.
 * Uses Google Cloud Vision API.
 * 
 * @param imageUri - Local file URI of the image
 * @param isHandwritten - Whether the image contains handwritten text (unused, kept for API compatibility)
 * @returns Extracted text from the image
 */
export async function processImage(imageUri: string, _isHandwritten: boolean = false): Promise<string> {
  const cloudResult = await tryCloudOcr(imageUri);
  if (cloudResult) {
    return cloudResult;
  }

  // If cloud OCR fails or is not configured, return empty
  console.log('OCR failed or not configured. Please set EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY in .env');
  return '';
}

/**
 * Attempt OCR using Google Cloud Vision API.
 */
async function tryCloudOcr(imageUri: string): Promise<string | null> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY;
  
  if (!apiKey) {
    console.log('No Google Cloud Vision API key configured. Set EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY in .env');
    return null;
  }

  try {
    // Read image as base64
    const base64Image = await readAsStringAsync(imageUri, {
      encoding: EncodingType.Base64,
    });

    const response = await fetch(
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

    if (!response.ok) {
      console.error('Cloud Vision API error:', response.status);
      return null;
    }

    const data = await response.json();
    const text = data.responses?.[0]?.fullTextAnnotation?.text ?? '';
    
    return text;
  } catch (error) {
    console.error('Cloud OCR error:', error);
    return null;
  }
}

/**
 * Check if cloud OCR is available (API key is configured).
 */
export function isCloudOcrAvailable(): boolean {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY;
  return !!apiKey && apiKey.length > 0;
}
