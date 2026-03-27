import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  copyAsync,
  deleteAsync,
  readDirectoryAsync,
  writeAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { File } from 'expo-file-system';

const PHOTOS_DIRECTORY = `${documentDirectory}photos/`;

/**
 * Ensure the photos directory exists.
 */
async function ensurePhotosDirectory(): Promise<void> {
  const dirInfo = await getInfoAsync(PHOTOS_DIRECTORY);
  if (!dirInfo.exists) {
    await makeDirectoryAsync(PHOTOS_DIRECTORY, { intermediates: true });
  }
}

/**
 * Save a photo to the app's local storage.
 * Copies the image from the camera/gallery to a permanent location.
 * 
 * @param sourceUri - The temporary URI from camera or image picker
 * @returns The permanent file URI
 */
export async function savePhotoToStorage(sourceUri: string): Promise<string> {
  await ensurePhotosDirectory();

  // Generate a unique filename
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const filename = `photo_${timestamp}_${randomId}.jpg`;
  const destinationUri = `${PHOTOS_DIRECTORY}${filename}`;

  // Copy the file to permanent storage
  await copyAsync({
    from: sourceUri,
    to: destinationUri,
  });

  return destinationUri;
}

/**
 * Delete a photo from local storage.
 * 
 * @param uri - The file URI to delete
 */
export async function deletePhotoFromStorage(uri: string): Promise<void> {
  try {
    const fileInfo = await getInfoAsync(uri);
    if (fileInfo.exists) {
      await deleteAsync(uri);
    }
  } catch (error) {
    console.error('Error deleting photo:', error);
  }
}

/**
 * Get information about stored photos.
 */
export async function getStorageInfo(): Promise<{
  photoCount: number;
  totalSizeBytes: number;
}> {
  await ensurePhotosDirectory();

  const files = await readDirectoryAsync(PHOTOS_DIRECTORY);
  let totalSize = 0;

  for (const filename of files) {
    const fileInfo = await getInfoAsync(`${PHOTOS_DIRECTORY}${filename}`);
    if (fileInfo.exists && 'size' in fileInfo) {
      totalSize += fileInfo.size || 0;
    }
  }

  return {
    photoCount: files.length,
    totalSizeBytes: totalSize,
  };
}

/**
 * Clear all stored photos.
 * Use with caution - this will delete all photo files.
 */
export async function clearAllPhotos(): Promise<void> {
  try {
    const dirInfo = await getInfoAsync(PHOTOS_DIRECTORY);
    if (dirInfo.exists) {
      await deleteAsync(PHOTOS_DIRECTORY, { idempotent: true });
      await ensurePhotosDirectory();
    }
  } catch (error) {
    console.error('Error clearing photos:', error);
  }
}

/**
 * Restore a photo file from base64 backup content.
 */
export async function restorePhotoFromBase64(filename: string, base64: string): Promise<string> {
  await ensurePhotosDirectory();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destinationUri = `${PHOTOS_DIRECTORY}${safeName}`;
  await writeAsStringAsync(destinationUri, base64, { encoding: EncodingType.Base64 });
  return destinationUri;
}

/**
 * Restore a photo file from raw bytes backup content.
 */
export async function restorePhotoFromBytes(filename: string, bytes: Uint8Array): Promise<string> {
  await ensurePhotosDirectory();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destinationUri = `${PHOTOS_DIRECTORY}${safeName}`;
  const file = new File(destinationUri);
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);
  return destinationUri;
}

/**
 * Restore a photo file by copying from another file URI.
 */
export async function restorePhotoFromFile(filename: string, sourceUri: string): Promise<string> {
  await ensurePhotosDirectory();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destinationUri = `${PHOTOS_DIRECTORY}${safeName}`;
  await copyAsync({
    from: sourceUri,
    to: destinationUri,
  });
  return destinationUri;
}
