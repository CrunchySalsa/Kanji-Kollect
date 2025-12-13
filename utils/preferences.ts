import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFERENCE_PREFIX = '@nihongo_tracker:';

/**
 * Get a preference value from AsyncStorage.
 */
export async function getPreference(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`${PREFERENCE_PREFIX}${key}`);
  } catch (error) {
    console.error('Error reading preference:', error);
    return null;
  }
}

/**
 * Set a preference value in AsyncStorage.
 */
export async function setPreference(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${PREFERENCE_PREFIX}${key}`, value);
  } catch (error) {
    console.error('Error saving preference:', error);
  }
}

/**
 * Remove a preference from AsyncStorage.
 */
export async function removePreference(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${PREFERENCE_PREFIX}${key}`);
  } catch (error) {
    console.error('Error removing preference:', error);
  }
}

/**
 * Get all preference keys.
 */
export async function getAllPreferenceKeys(): Promise<string[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    return allKeys
      .filter(key => key.startsWith(PREFERENCE_PREFIX))
      .map(key => key.slice(PREFERENCE_PREFIX.length));
  } catch (error) {
    console.error('Error getting preference keys:', error);
    return [];
  }
}

