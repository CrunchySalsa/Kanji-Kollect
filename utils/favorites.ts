import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITES_KEY = '@kanji_kollect:favorites';

export interface FavoriteItem {
  type: 'kanji' | 'word';
  id: string;
  wordAliases?: string[];
}

/**
 * Get all favorite items from storage.
 */
export async function getFavorites(): Promise<FavoriteItem[]> {
  try {
    const json = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!json) return [];
    return JSON.parse(json) as FavoriteItem[];
  } catch (error) {
    console.error('Error reading favorites:', error);
    return [];
  }
}

/**
 * Save favorites to storage.
 */
async function saveFavorites(favorites: FavoriteItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch (error) {
    console.error('Error saving favorites:', error);
  }
}

/**
 * Check if an item is favorited.
 */
export async function isFavorite(type: 'kanji' | 'word', id: string): Promise<boolean> {
  const favorites = await getFavorites();
  return favorites.some((f) => f.type === type && f.id === id);
}

/**
 * Add an item to favorites.
 */
export async function addFavorite(item: FavoriteItem): Promise<void> {
  const favorites = await getFavorites();
  const exists = favorites.some((f) => f.type === item.type && f.id === item.id);
  if (!exists) {
    favorites.push(item);
    await saveFavorites(favorites);
  }
}

/**
 * Remove an item from favorites.
 */
export async function removeFavorite(type: 'kanji' | 'word', id: string): Promise<void> {
  const favorites = await getFavorites();
  const filtered = favorites.filter((f) => !(f.type === type && f.id === id));
  await saveFavorites(filtered);
}

/**
 * Toggle an item's favorite status.
 */
export async function toggleFavorite(item: FavoriteItem): Promise<boolean> {
  const favorites = await getFavorites();
  const index = favorites.findIndex((f) => f.type === item.type && f.id === item.id);
  if (index >= 0) {
    favorites.splice(index, 1);
    await saveFavorites(favorites);
    return false;
  } else {
    favorites.push(item);
    await saveFavorites(favorites);
    return true;
  }
}

