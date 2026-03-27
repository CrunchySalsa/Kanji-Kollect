import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File } from 'expo-file-system';
import { readAsStringAsync, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { exportDatabaseSnapshot, importDatabaseSnapshot, DatabaseSnapshot } from './database';
import { clearAllPhotos, restorePhotoFromFile } from './photoStorage';

const PREF_PREFIX = '@kanji_kollect:';
const API_KEY_STORAGE_KEY = `${PREF_PREFIX}apiKey`;
const FAVORITES_STORAGE_KEY = `${PREF_PREFIX}favorites`;

interface BackupImageEntry {
  photoId: number;
  originalUri: string;
  filename: string;
  backupFilename: string;
}

interface BackupPayloadV1 {
  version: 1;
  app: 'kanji-kollect';
  createdAt: number;
  database: DatabaseSnapshot;
  preferences: Record<string, string>;
  favorites: unknown[];
  images: BackupImageEntry[];
}

function getFileNameFromUri(uri: string, fallbackId: number): string {
  const last = uri.split('/').pop() || '';
  if (last.trim()) return last;
  return `photo_${fallbackId}.jpg`;
}

type FsEntry = {
  uri: string;
  name?: string;
  list?: () => FsEntry[];
  text?: () => Promise<string>;
};

function asName(entry: FsEntry): string {
  return entry.name ?? '';
}

function isFsDirectory(entry: FsEntry): entry is FsEntry & { list: () => FsEntry[] } {
  return typeof entry.list === 'function';
}

function isFsFile(entry: FsEntry): entry is FsEntry & { text: () => Promise<string> } {
  return typeof entry.text === 'function';
}

function findFileByName(entries: FsEntry[], name: string): (FsEntry & { text: () => Promise<string> }) | null {
  for (const entry of entries) {
    if (isFsFile(entry) && asName(entry) === name) {
      return entry;
    }
  }
  return null;
}

function findDirectoryByName(entries: FsEntry[], name: string): (FsEntry & { list: () => FsEntry[] }) | null {
  for (const entry of entries) {
    if (isFsDirectory(entry) && asName(entry) === name) {
      return entry;
    }
  }
  return null;
}

async function createUniqueBackupDirectory(rootDir: { createDirectory: (name: string) => any }, baseName: string): Promise<any> {
  try {
    return rootDir.createDirectory(baseName);
  } catch {
    const suffix = Math.random().toString(36).slice(2, 8);
    return rootDir.createDirectory(`${baseName}-${suffix}`);
  }
}

async function collectPreferencesWithoutApiKey(): Promise<Record<string, string>> {
  const allKeys = await AsyncStorage.getAllKeys();
  const prefKeys = allKeys.filter(
    (key) => key.startsWith(PREF_PREFIX) && key !== API_KEY_STORAGE_KEY && key !== FAVORITES_STORAGE_KEY
  );
  if (!prefKeys.length) return {};

  const kv = await AsyncStorage.multiGet(prefKeys);
  const out: Record<string, string> = {};
  for (const [rawKey, value] of kv) {
    if (value == null) continue;
    out[rawKey.slice(PREF_PREFIX.length)] = value;
  }
  return out;
}

async function restorePreferencesWithoutApiKey(preferences: Record<string, string>): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const toRemove = allKeys.filter(
    (key) => key.startsWith(PREF_PREFIX) && key !== API_KEY_STORAGE_KEY && key !== FAVORITES_STORAGE_KEY
  );
  if (toRemove.length) {
    await AsyncStorage.multiRemove(toRemove);
  }

  const toSet = Object.entries(preferences).map(([key, value]) => [`${PREF_PREFIX}${key}`, value] as [string, string]);
  if (toSet.length) {
    await AsyncStorage.multiSet(toSet);
  }
}

export async function exportBackupToUserStorage(): Promise<{ filename: string; imageCount: number }> {
  const snapshot = await exportDatabaseSnapshot();
  const preferences = await collectPreferencesWithoutApiKey();
  const favoritesRaw = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
  const favorites = favoritesRaw ? (JSON.parse(favoritesRaw) as unknown[]) : [];

  const baseBackupName = `kanji-kollect-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const rootDir = await Directory.pickDirectoryAsync();
  const backupDir = await createUniqueBackupDirectory(rootDir, baseBackupName);
  const imagesDir = backupDir.createDirectory('images');

  const images: BackupImageEntry[] = [];
  for (const photo of snapshot.photos) {
    const filename = getFileNameFromUri(photo.uri, photo.id);
    const backupFilename = `${photo.id}__${filename}`;
    const sourceFile = new File(photo.uri);
    const destinationFile = imagesDir.createFile(backupFilename, sourceFile.type || 'image/jpeg');
    const sourceBase64 = await readAsStringAsync(sourceFile.uri, { encoding: EncodingType.Base64 });
    await writeAsStringAsync(destinationFile.uri, sourceBase64, { encoding: EncodingType.Base64 });
    images.push({
      photoId: photo.id,
      originalUri: photo.uri,
      filename,
      backupFilename,
    });
  }

  const payload: BackupPayloadV1 = {
    version: 1,
    app: 'kanji-kollect',
    createdAt: Date.now(),
    database: snapshot,
    preferences,
    favorites,
    images,
  };

  const metadataFile = backupDir.createFile('metadata.json', 'application/json');
  metadataFile.write(JSON.stringify(payload));
  return { filename: asName(backupDir), imageCount: images.length };
}

export async function restoreBackupFromPickedFile(): Promise<{ imageCount: number }> {
  const backupDir = await Directory.pickDirectoryAsync();
  const rootEntries = backupDir.list();
  const metadataFile = findFileByName(rootEntries, 'metadata.json');
  if (!metadataFile) {
    throw new Error('Selected folder does not contain metadata.json.');
  }
  const payload = JSON.parse(await metadataFile.text()) as BackupPayloadV1;
  const images = payload.images ?? [];

  if (payload.version !== 1 || payload.app !== 'kanji-kollect' || !payload.database || !Array.isArray(images)) {
    throw new Error('Invalid backup file format.');
  }

  const imagesDir = findDirectoryByName(rootEntries, 'images');
  if (!imagesDir) {
    throw new Error('Selected backup folder is missing the images directory.');
  }

  const imageEntries = imagesDir.list();
  const imageFileMap = new Map<string, File>();
  for (const entry of imageEntries) {
    if (!(entry instanceof File)) continue;
    const name = asName(entry);
    if (name) imageFileMap.set(name, entry);
  }

  // Validate backup integrity before mutating local storage.
  for (const image of images) {
    if (!imageFileMap.has(image.backupFilename)) {
      throw new Error(`Missing image file: ${image.backupFilename}`);
    }
  }

  const uriMap = new Map<string, string>();
  await clearAllPhotos();
  for (const image of images) {
    const sourceImage = imageFileMap.get(image.backupFilename)!;
    const restoredUri = await restorePhotoFromFile(image.filename, sourceImage.uri);
    uriMap.set(image.originalUri, restoredUri);
  }

  const photosWithRestoredUris = payload.database.photos.map((p) => ({
    ...p,
    uri: uriMap.get(p.uri) ?? p.uri,
  }));

  await importDatabaseSnapshot({
    ...payload.database,
    photos: photosWithRestoredUris,
  });

  await restorePreferencesWithoutApiKey(payload.preferences ?? {});
  await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(payload.favorites ?? []));

  return { imageCount: images.length };
}
