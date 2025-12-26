import { PhotoEntry, KanjiEntry, WordEntry } from '../../services/database';

export type ItemType = 'kanji' | 'word';
export type SortMethod = 'encountered' | 'practiced' | 'mastery' | 'priority';
export type SortDir = 'desc' | 'asc';
export type FilterType = 'kanji' | 'word';
export type GalleryType = 'encounter' | 'practice';
export type PhotoType = 'encounter' | 'practice';

export type Screen = 'list' | 'gallery' | 'detail' | 'settings' | 'favorites';

export type ListItem =
  | { type: 'kanji'; key: string; display: string; encounter_count: number; practice_count: number }
  | { type: 'word'; key: string; display: string; encounter_count: number; practice_count: number; wordAliases?: string[] };

export interface DetailInfo {
  type: ItemType;
  id: string;
  wordAliases?: string[];
}

export interface KanjiInfo {
  readings: { onyomi: string[]; kunyomi: string[] };
  meanings: string[];
}

export interface WordInfo {
  reading: string;
  meaning: string[];
}

export interface MetaCacheEntry {
  meaning?: string;
  reading?: string;
  onyomi?: string;
  kunyomi?: string;
}

export interface EditModalState {
  visible: boolean;
  photo: PhotoEntry | null;
  kanjiText: string;
  wordsText: string;
}

export interface CaptureModalState {
  visible: boolean;
  photoType: PhotoType | null;
}

export interface WordKanjiModalState {
  visible: boolean;
  kanji: string[];
}

export interface FullImageMeta {
  kanji: string[];
  words: string[];
}

export { PhotoEntry, KanjiEntry, WordEntry };
export type { FavoriteItem } from '../../utils/favorites';

