import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  copyAsync,
  deleteAsync,
  readDirectoryAsync,
} from 'expo-file-system/legacy';

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
