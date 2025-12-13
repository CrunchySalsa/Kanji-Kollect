import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { toRomaji } from 'wanakana';

import {
  Screen,
  ItemType,
  SortMethod,
  SortDir,
  FilterType,
  GalleryType,
  PhotoType,
  ListItem,
  DetailInfo,
  KanjiInfo,
  WordInfo,
  MetaCacheEntry,
  EditModalState,
  CaptureModalState,
  WordKanjiModalState,
  FullImageMeta,
  PhotoEntry,
  KanjiEntry,
  WordEntry,
} from '../types';

import {
  initDatabase,
  savePhoto,
  getKanjiList,
  getWordsList,
  getPhotosForKanji,
  getPhotosForWord,
  deletePhoto,
  getKanjiForPhoto,
  getWordsForPhoto,
  setPhotoKanjiCounts,
  setPhotoWordCounts,
  getWordsContainingKanji,
  hideKanji,
  hideWord,
  getHiddenKanjiList,
  getHiddenWordsList,
  unhideKanji,
  unhideWord,
  getAllPhotos,
} from '../../services/database';
import { savePhotoToStorage, deletePhotoFromStorage } from '../../services/photoStorage';
import { processImage } from '../../services/ocr';
import { extractKanjiAndWordsWithCountsSmart, isKanji } from '../../utils/kanjiExtractor';
import { getPreference, setPreference } from '../../utils/preferences';
import { lookupKanjiNormalized, lookupWordFlexible } from '../../services/dictionary';
import { useUiBusy } from '../hooks';

interface NavHistoryEntry {
  screen: Screen;
  detail: DetailInfo | null;
  fullImageSnapshot?: {
    photo: PhotoEntry | null;
    meta: FullImageMeta | null;
    menuVisible: boolean;
    menuTab: 'kanji' | 'word';
    scrollY: { kanji: number; word: number };
  };
  detailSnapshot?: {
    detailPhotos: PhotoEntry[];
    detailKanjiInfo: KanjiInfo | null;
    detailWordInfo: WordInfo | null;
    detailWordsSpotted: WordEntry[];
    detailLoading: boolean;
    wordKanjiModal: WordKanjiModalState;
  };
}

interface ListContextType {
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortMethod: SortMethod;
  sortDir: SortDir;
  filterType: FilterType;
  setSortMethod: (m: SortMethod) => void;
  setSortDir: (d: SortDir) => void;
  setFilterTypeAndPersist: (t: FilterType) => void;
  filteredSortedByType: { kanji: ListItem[]; word: ListItem[] };
  combinedSearchResults: ListItem[];
  normalizedQuery: string;
  metaCache: Record<string, MetaCacheEntry>;
  setListViewportStart: (which: 'kanji' | 'word' | 'search', startIndex: number) => void;
  openDetail: (type: ItemType, id: string, wordAliases?: string[]) => Promise<void>;
  reloadList: () => Promise<void>;
  setCaptureModal: React.Dispatch<React.SetStateAction<CaptureModalState>>;
}

interface AppContextType {
  // Screen navigation
  screen: Screen;
  setScreen: (s: Screen) => void;
  goBack: () => boolean;

  // List data
  items: ListItem[];
  loading: boolean;
  reloadList: () => Promise<void>;

  // Filtering & sorting
  sortMethod: SortMethod;
  sortDir: SortDir;
  filterType: FilterType;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  setSortMethod: (m: SortMethod) => void;
  setSortDir: (d: SortDir) => void;
  setFilterTypeAndPersist: (t: FilterType) => void;

  // Gallery
  galleryType: GalleryType;
  setGalleryType: (t: GalleryType) => void;
  allPhotos: PhotoEntry[];
  galleryLoading: boolean;
  reloadGallery: () => Promise<void>;
  openGallery: () => Promise<void>;

  // Detail
  detail: DetailInfo | null;
  detailPhotos: PhotoEntry[];
  detailKanjiInfo: KanjiInfo | null;
  detailWordInfo: WordInfo | null;
  detailWordsSpotted: WordEntry[];
  detailLoading: boolean;
  openDetail: (type: ItemType, id: string, wordAliases?: string[]) => Promise<void>;

  // Meta cache for dictionary lookups
  metaCache: Record<string, MetaCacheEntry>;

  // Modals
  editModal: EditModalState;
  setEditModal: React.Dispatch<React.SetStateAction<EditModalState>>;
  captureModal: CaptureModalState;
  setCaptureModal: React.Dispatch<React.SetStateAction<CaptureModalState>>;
  wordKanjiModal: WordKanjiModalState;
  setWordKanjiModal: React.Dispatch<React.SetStateAction<WordKanjiModalState>>;
  fullImagePhoto: PhotoEntry | null;
  setFullImagePhoto: React.Dispatch<React.SetStateAction<PhotoEntry | null>>;
  fullImageMeta: FullImageMeta | null;
  setFullImageMeta: React.Dispatch<React.SetStateAction<FullImageMeta | null>>;
  fullImageMenuVisible: boolean;
  setFullImageMenuVisible: React.Dispatch<React.SetStateAction<boolean>>;
  fullImageMenuTab: 'kanji' | 'word';
  setFullImageMenuTab: React.Dispatch<React.SetStateAction<'kanji' | 'word'>>;
  fullImageMenuScrollY: { kanji: number; word: number };
  setFullImageMenuScrollY: React.Dispatch<React.SetStateAction<{ kanji: number; word: number }>>;

  // Processing state
  processing: boolean;
  processingStatus: string;
  processingPhotoType: PhotoType | null;
  pickerBusy: boolean;
  pickerBusyPhotoType: PhotoType | null;

  // UI Busy
  uiBusy: boolean;
  uiBusyLabel: string;

  // Hidden items (settings)
  hiddenKanjiItems: KanjiEntry[];
  hiddenWordGroups: { display: string; aliases: string[] }[];
  loadHiddenItems: () => Promise<void>;

  // Actions
  openFullImage: (photo: PhotoEntry) => Promise<void>;
  openEditForPhoto: (photo: PhotoEntry) => Promise<void>;
  saveEditForPhoto: () => Promise<void>;
  applyEditsForPhoto: (photo: PhotoEntry, kanji: string[], words: string[]) => Promise<void>;
  reprocessPhoto: (photo: PhotoEntry) => Promise<void>;
  onDeletePhoto: (photo: PhotoEntry) => void;
  captureFromCamera: (photoType: PhotoType) => Promise<void>;
  pickFromGallery: (photoType: PhotoType) => Promise<void>;

  // Filtered/sorted data
  filteredSortedByType: { kanji: ListItem[]; word: ListItem[] };
  filteredSorted: ListItem[];
  combinedSearchResults: ListItem[];
  normalizedQuery: string;
}

const AppContext = createContext<AppContextType | null>(null);
const ListContext = createContext<ListContextType | null>(null);

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}

export function useListContext() {
  const context = useContext(ListContext);
  if (!context) {
    throw new Error('useListContext must be used within AppProvider');
  }
  return context;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<Screen>('list');
  const [items, setItems] = useState<ListItem[]>([]);
  const navHistoryRef = useRef<NavHistoryEntry[]>([]);
  const screenRef = useRef<Screen>('list');
  const detailRef = useRef<DetailInfo | null>(null);
  const [sortMethod, setSortMethodState] = useState<SortMethod>('gap');
  const [sortDir, setSortDirState] = useState<SortDir>('desc');
  const [filterType, setFilterType] = useState<FilterType>('kanji');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [metaCache, setMetaCache] = useState<Record<string, MetaCacheEntry>>({});
  const [listViewportStart, setListViewportStartState] = useState({ kanji: 0, word: 0, search: 0 });

  const [detail, setDetail] = useState<DetailInfo | null>(null);
  const [detailPhotos, setDetailPhotos] = useState<PhotoEntry[]>([]);
  const [detailKanjiInfo, setDetailKanjiInfo] = useState<KanjiInfo | null>(null);
  const [detailWordInfo, setDetailWordInfo] = useState<WordInfo | null>(null);
  const [detailWordsSpotted, setDetailWordsSpotted] = useState<WordEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailPhotosRef = useRef<PhotoEntry[]>([]);
  const detailKanjiInfoRef = useRef<KanjiInfo | null>(null);
  const detailWordInfoRef = useRef<WordInfo | null>(null);
  const detailWordsSpottedRef = useRef<WordEntry[]>([]);
  const detailLoadingRef = useRef(false);

  const [galleryType, setGalleryTypeState] = useState<GalleryType>('encounter');
  const [allPhotos, setAllPhotos] = useState<PhotoEntry[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);

  const [wordKanjiModal, setWordKanjiModal] = useState<WordKanjiModalState>({ visible: false, kanji: [] });
  const wordKanjiModalRef = useRef<WordKanjiModalState>({ visible: false, kanji: [] });
  const [fullImagePhoto, setFullImagePhoto] = useState<PhotoEntry | null>(null);
  const [fullImageMeta, setFullImageMeta] = useState<FullImageMeta | null>(null);
  const [fullImageMenuVisible, setFullImageMenuVisible] = useState(false);
  const [fullImageMenuTab, setFullImageMenuTab] = useState<'kanji' | 'word'>('kanji');
  const [fullImageMenuScrollY, setFullImageMenuScrollY] = useState<{ kanji: number; word: number }>({ kanji: 0, word: 0 });
  const fullImagePhotoRef = useRef<PhotoEntry | null>(null);
  const fullImageMetaRef = useRef<FullImageMeta | null>(null);
  const fullImageMenuVisibleRef = useRef(false);
  const fullImageMenuTabRef = useRef<'kanji' | 'word'>('kanji');
  const fullImageMenuScrollYRef = useRef<{ kanji: number; word: number }>({ kanji: 0, word: 0 });
  const [editModal, setEditModal] = useState<EditModalState>({ visible: false, photo: null, kanjiText: '', wordsText: '' });
  const [captureModal, setCaptureModal] = useState<CaptureModalState>({ visible: false, photoType: null });

  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('Processing…');
  const [processingPhotoType, setProcessingPhotoType] = useState<PhotoType | null>(null);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerBusyPhotoType, setPickerBusyPhotoType] = useState<PhotoType | null>(null);

  const [hiddenKanjiItems, setHiddenKanjiItems] = useState<KanjiEntry[]>([]);
  const [hiddenWordGroups, setHiddenWordGroups] = useState<{ display: string; aliases: string[] }[]>([]);

  const { uiBusy, uiBusyLabel, runWithUiBusy } = useUiBusy();

  const ensureMetaForKeys = useCallback(
    async (keys: string[]) => {
      const uniq = Array.from(new Set(keys.filter(Boolean)));
      const missing = uniq.filter((k) => !metaCache[k]);
      if (!missing.length) return;

      const additions: Record<string, MetaCacheEntry> = {};
      let processed = 0;
      for (const key of missing.slice(0, 200)) {
        const [type, display] = key.split(':', 2) as [ItemType, string];
        if (type === 'kanji') {
          const info = await lookupKanjiNormalized(display);
          const meaning = info?.meanings?.filter(Boolean).join(', ');
          additions[key] = { meaning: meaning || undefined };
        } else {
          const info = await lookupWordFlexible(display);
          const meaning = info?.meaning?.filter(Boolean).join(', ');
          additions[key] = { meaning: meaning || undefined, reading: info?.reading || undefined };
        }
        processed++;
        if (processed % 10 === 0) await new Promise((r) => setTimeout(r, 0));
      }

      if (Object.keys(additions).length) {
        setMetaCache((prev) => ({ ...prev, ...additions }));
      }
    },
    [metaCache]
  );

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  useEffect(() => {
    detailPhotosRef.current = detailPhotos;
  }, [detailPhotos]);

  useEffect(() => {
    detailKanjiInfoRef.current = detailKanjiInfo;
  }, [detailKanjiInfo]);

  useEffect(() => {
    detailWordInfoRef.current = detailWordInfo;
  }, [detailWordInfo]);

  useEffect(() => {
    detailWordsSpottedRef.current = detailWordsSpotted;
  }, [detailWordsSpotted]);

  useEffect(() => {
    detailLoadingRef.current = detailLoading;
  }, [detailLoading]);

  useEffect(() => {
    wordKanjiModalRef.current = wordKanjiModal;
  }, [wordKanjiModal]);

  useEffect(() => {
    fullImagePhotoRef.current = fullImagePhoto;
  }, [fullImagePhoto]);

  useEffect(() => {
    fullImageMetaRef.current = fullImageMeta;
  }, [fullImageMeta]);

  useEffect(() => {
    fullImageMenuVisibleRef.current = fullImageMenuVisible;
  }, [fullImageMenuVisible]);

  useEffect(() => {
    fullImageMenuTabRef.current = fullImageMenuTab;
  }, [fullImageMenuTab]);

  useEffect(() => {
    fullImageMenuScrollYRef.current = fullImageMenuScrollY;
  }, [fullImageMenuScrollY]);

  const captureNavEntry = useCallback((): NavHistoryEntry => {
    const currentScreen = screenRef.current;
    const currentDetail = detailRef.current;
    const entry: NavHistoryEntry = { screen: currentScreen, detail: currentDetail };

    // Preserve full-image overlay state (so Back can restore it after navigating away).
    entry.fullImageSnapshot = {
      photo: fullImagePhotoRef.current,
      meta: fullImageMetaRef.current,
      menuVisible: fullImageMenuVisibleRef.current,
      menuTab: fullImageMenuTabRef.current,
      scrollY: fullImageMenuScrollYRef.current,
    };

    if (currentScreen === 'detail' && currentDetail) {
      entry.detailSnapshot = {
        detailPhotos: detailPhotosRef.current,
        detailKanjiInfo: detailKanjiInfoRef.current,
        detailWordInfo: detailWordInfoRef.current,
        detailWordsSpotted: detailWordsSpottedRef.current,
        detailLoading: detailLoadingRef.current,
        wordKanjiModal: wordKanjiModalRef.current,
      };
    }

    return entry;
  }, []);

  // Initialize database
  useEffect(() => {
    initDatabase().catch((e) => console.error(e));
  }, []);

  // Load preferences on mount
  useEffect(() => {
    (async () => {
      const savedSort = await getPreference('sortMethod');
      const savedSortDir = await getPreference('sortDir');
      const savedFilter = await getPreference('filterType');
      const savedGalleryType = await getPreference('galleryType');
      if (savedSort === 'gap' || savedSort === 'encountered' || savedSort === 'practiced') setSortMethodState(savedSort);
      if (savedSortDir === 'asc' || savedSortDir === 'desc') setSortDirState(savedSortDir);
      if (savedFilter === 'kanji') setFilterType('kanji');
      if (savedFilter === 'word') setFilterType('word');
      if (savedFilter === 'words') setFilterType('word');
      if (savedGalleryType === 'encounter' || savedGalleryType === 'practice') setGalleryTypeState(savedGalleryType);
    })().catch((e) => console.error(e));
  }, []);

  const setSortMethod = useCallback((m: SortMethod) => {
    setSortMethodState(m);
    setPreference('sortMethod', m);
  }, []);

  const setSortDir = useCallback((d: SortDir) => {
    setSortDirState(d);
    setPreference('sortDir', d);
  }, []);

  const setFilterTypeAndPersist = useCallback((t: FilterType) => {
    setFilterType(t);
    setPreference('filterType', t);
  }, []);

  const setGalleryType = useCallback((t: GalleryType) => {
    setGalleryTypeState(t);
    setPreference('galleryType', t);
  }, []);

  const goBack = useCallback(() => {
    const history = navHistoryRef.current;
    if (history.length === 0) {
      if (screenRef.current !== 'list') {
        setScreen('list');
        return true;
      }
      return false;
    }
    const prev = history.pop()!;
    setScreen(prev.screen);
    setDetail(prev.detail);
    if (prev.fullImageSnapshot) {
      setFullImagePhoto(prev.fullImageSnapshot.photo);
      setFullImageMeta(prev.fullImageSnapshot.meta);
      setFullImageMenuVisible(prev.fullImageSnapshot.menuVisible);
      setFullImageMenuTab(prev.fullImageSnapshot.menuTab);
      setFullImageMenuScrollY(prev.fullImageSnapshot.scrollY);
      const kanji = prev.fullImageSnapshot.meta?.kanji ?? [];
      const words = prev.fullImageSnapshot.meta?.words ?? [];
      if (kanji.length || words.length) {
        ensureMetaForKeys([...kanji.map((k) => `kanji:${k}`), ...words.map((w) => `word:${w}`)]).catch((e) => console.error(e));
      }
    }
    if (prev.screen === 'detail' && prev.detailSnapshot) {
      setDetailPhotos(prev.detailSnapshot.detailPhotos);
      setDetailKanjiInfo(prev.detailSnapshot.detailKanjiInfo);
      setDetailWordInfo(prev.detailSnapshot.detailWordInfo);
      setDetailWordsSpotted(prev.detailSnapshot.detailWordsSpotted);
      setDetailLoading(prev.detailSnapshot.detailLoading);
      setWordKanjiModal(prev.detailSnapshot.wordKanjiModal);
    }
    return true;
  }, [ensureMetaForKeys]);

  const loadHiddenItems = useCallback(async () => {
    const [hk, hw] = await Promise.all([getHiddenKanjiList(), getHiddenWordsList()]);
    setHiddenKanjiItems(hk);
    const grouped = new Map<string, Set<string>>();
    for (const w of hw) {
      let display = w.word;
      const hit = await lookupWordFlexible(w.word);
      if (hit?.word) display = hit.word;
      const set = grouped.get(display) ?? new Set<string>();
      set.add(w.word);
      grouped.set(display, set);
    }
    setHiddenWordGroups(Array.from(grouped.entries()).map(([display, set]) => ({ display, aliases: Array.from(set) })));
  }, []);

  useEffect(() => {
    if (screen === 'settings') {
      loadHiddenItems().catch((e) => console.error(e));
    }
  }, [loadHiddenItems, screen]);

  const reloadList = useCallback(async () => {
    setLoading(true);
    const kanji = await getKanjiList();
    const words = await getWordsList();
    const groupedWords = new Map<string, { encounter: number; practice: number; aliases: Set<string> }>();
    for (const w of words) {
      let display = w.word;
      const hit = await lookupWordFlexible(w.word);
      if (hit?.word) display = hit.word;
      const g = groupedWords.get(display) ?? { encounter: 0, practice: 0, aliases: new Set<string>() };
      g.encounter += w.encounter_count;
      g.practice += w.practice_count;
      g.aliases.add(w.word);
      groupedWords.set(display, g);
    }

    const combined: ListItem[] = [
      ...kanji.map((k) => ({
        type: 'kanji' as const,
        key: `kanji:${k.character}`,
        display: k.character,
        encounter_count: k.encounter_count,
        practice_count: k.practice_count,
      })),
      ...Array.from(groupedWords.entries()).map(([display, g]) => ({
        type: 'word' as const,
        key: `word:${display}`,
        display,
        encounter_count: g.encounter,
        practice_count: g.practice,
        wordAliases: Array.from(g.aliases),
      })),
    ];
    setItems(combined);
    setLoading(false);
  }, []);

  const reloadGallery = useCallback(async () => {
    setGalleryLoading(true);
    const photos = await getAllPhotos();
    setAllPhotos(photos);
    setGalleryLoading(false);
  }, []);

  useEffect(() => {
    reloadList().catch((e) => console.error(e));
  }, [reloadList]);

  // Filtering and sorting
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const romajiQuery = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return null;
    if (!/^[a-zA-Z0-9\s\-']+$/.test(q)) return null;
    return q.toLowerCase();
  }, [searchQuery]);

  const filteredSortedByType = useMemo(() => {
    const build = (t: ItemType) => {
      let out = items.filter((i) => i.type === t);

      if (normalizedQuery) {
        out = out.filter((i) => {
          const key = `${i.type}:${i.display}`;
          const meta = metaCache[key];
          const haystack = [
            i.display,
            meta?.meaning ?? '',
            meta?.reading ?? '',
            meta?.onyomi ?? '',
            meta?.kunyomi ?? '',
          ]
            .join(' ')
            .toLowerCase();
          if (haystack.includes(normalizedQuery)) return true;

          if (romajiQuery) {
            const readingHay = [meta?.reading ?? '', meta?.onyomi ?? '', meta?.kunyomi ?? ''].join(' ');
            if (readingHay) {
              const r = toRomaji(readingHay).toLowerCase();
              if (r.includes(romajiQuery)) return true;
            }
            const d = toRomaji(i.display).toLowerCase();
            if (d.includes(romajiQuery)) return true;
          }

          return false;
        });
      }

      const sorted = [...out].sort((a, b) => {
        const dir = sortDir === 'desc' ? 1 : -1;
        if (sortMethod === 'encountered') return (b.encounter_count - a.encounter_count) * dir;
        if (sortMethod === 'practiced') return (b.practice_count - a.practice_count) * dir;
        const gapA = a.encounter_count - a.practice_count;
        const gapB = b.encounter_count - b.practice_count;
        if (gapB !== gapA) return (gapB - gapA) * dir;
        return (b.encounter_count - a.encounter_count) * dir;
      });
      return sorted;
    };

    return {
      kanji: build('kanji'),
      word: build('word'),
    };
  }, [items, normalizedQuery, sortMethod, sortDir, metaCache, romajiQuery]);

  const filteredSorted = useMemo(() => {
    return filterType === 'kanji' ? filteredSortedByType.kanji : filteredSortedByType.word;
  }, [filterType, filteredSortedByType.kanji, filteredSortedByType.word]);

  const combinedSearchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return [...filteredSortedByType.kanji, ...filteredSortedByType.word].sort((a, b) => {
      const dir = sortDir === 'desc' ? 1 : -1;
      if (sortMethod === 'encountered') return (b.encounter_count - a.encounter_count) * dir;
      if (sortMethod === 'practiced') return (b.practice_count - a.practice_count) * dir;
      const gapA = a.encounter_count - a.practice_count;
      const gapB = b.encounter_count - b.practice_count;
      if (gapB !== gapA) return (gapB - gapA) * dir;
      return (b.encounter_count - a.encounter_count) * dir;
    });
  }, [normalizedQuery, filteredSortedByType.kanji, filteredSortedByType.word, sortMethod, sortDir]);

  const setListViewportStart = useCallback((which: 'kanji' | 'word' | 'search', startIndex: number) => {
    const next = Math.max(0, startIndex | 0);
    setListViewportStartState((prev) => {
      const cur = prev[which] ?? 0;
      // Avoid excessive updates during scroll; re-bucket roughly every 10 rows.
      if (Math.abs(cur - next) < 10) return prev;
      return { ...prev, [which]: next };
    });
  }, []);

  // Prefetch dictionary metadata for items near the current viewport (per list)
  useEffect(() => {
    if (normalizedQuery) return;

    const start = listViewportStart.kanji ?? 0;
    const windowed = filteredSortedByType.kanji.slice(start, start + 80);
    const missingKeys = windowed
      .map((i) => `${i.type}:${i.display}`)
      .filter((k) => !metaCache[k]);
    if (!missingKeys.length) return;

    let cancelled = false;
    (async () => {
      const additions: Record<string, MetaCacheEntry> = {};
      let processed = 0;

      for (const key of missingKeys) {
        if (cancelled) return;
        const [type, display] = key.split(':', 2) as [ItemType, string];
        if (type === 'kanji') {
          const info = await lookupKanjiNormalized(display);
          const meaning = info?.meanings?.filter(Boolean).join(', ');
          additions[key] = {
            meaning: meaning || undefined,
            onyomi: info?.readings?.onyomi?.join(' ') || undefined,
            kunyomi: info?.readings?.kunyomi?.join(' ') || undefined,
          };
        } else {
          const info = await lookupWordFlexible(display);
          const meaning = info?.meaning?.filter(Boolean).join(', ');
          additions[key] = {
            meaning: meaning || undefined,
            reading: info?.reading || undefined,
          };
        }

        processed++;
        if (processed % 10 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (cancelled) return;
      if (Object.keys(additions).length) {
        setMetaCache((prev) => ({ ...prev, ...additions }));
      }
    })().catch((e) => console.error(e));

    return () => {
      cancelled = true;
    };
  }, [filteredSortedByType.kanji, listViewportStart.kanji, metaCache, normalizedQuery]);

  useEffect(() => {
    if (normalizedQuery) return;

    const start = listViewportStart.word ?? 0;
    const windowed = filteredSortedByType.word.slice(start, start + 80);
    const missingKeys = windowed
      .map((i) => `${i.type}:${i.display}`)
      .filter((k) => !metaCache[k]);
    if (!missingKeys.length) return;

    let cancelled = false;
    (async () => {
      const additions: Record<string, MetaCacheEntry> = {};
      let processed = 0;

      for (const key of missingKeys) {
        if (cancelled) return;
        const [type, display] = key.split(':', 2) as [ItemType, string];
        if (type === 'kanji') {
          const info = await lookupKanjiNormalized(display);
          const meaning = info?.meanings?.filter(Boolean).join(', ');
          additions[key] = {
            meaning: meaning || undefined,
            onyomi: info?.readings?.onyomi?.join(' ') || undefined,
            kunyomi: info?.readings?.kunyomi?.join(' ') || undefined,
          };
        } else {
          const info = await lookupWordFlexible(display);
          const meaning = info?.meaning?.filter(Boolean).join(', ');
          additions[key] = {
            meaning: meaning || undefined,
            reading: info?.reading || undefined,
          };
        }

        processed++;
        if (processed % 10 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (cancelled) return;
      if (Object.keys(additions).length) {
        setMetaCache((prev) => ({ ...prev, ...additions }));
      }
    })().catch((e) => console.error(e));

    return () => {
      cancelled = true;
    };
  }, [filteredSortedByType.word, listViewportStart.word, metaCache, normalizedQuery]);

  // Progressively fetch metadata when searching
  useEffect(() => {
    if (!normalizedQuery) return;

    const candidates = items
      .filter((i) => i.type === filterType)
      .map((i) => `${i.type}:${i.display}`)
      .filter((k) => !metaCache[k]);

    if (!candidates.length) return;

    let cancelled = false;
    (async () => {
      const additions: Record<string, MetaCacheEntry> = {};
      let processed = 0;
      const maxLookups = 400;

      for (const key of candidates.slice(0, maxLookups)) {
        if (cancelled) return;
        const [type, display] = key.split(':', 2) as [ItemType, string];
        if (type === 'kanji') {
          const info = await lookupKanjiNormalized(display);
          const meaning = info?.meanings?.filter(Boolean).join(', ');
          additions[key] = {
            meaning: meaning || undefined,
            onyomi: info?.readings?.onyomi?.join(' ') || undefined,
            kunyomi: info?.readings?.kunyomi?.join(' ') || undefined,
          };
        } else {
          const info = await lookupWordFlexible(display);
          const meaning = info?.meaning?.filter(Boolean).join(', ');
          additions[key] = {
            meaning: meaning || undefined,
            reading: info?.reading || undefined,
          };
        }

        processed++;
        if (processed % 10 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (cancelled) return;
      if (Object.keys(additions).length) {
        setMetaCache((prev) => ({ ...prev, ...additions }));
      }
    })().catch((e) => console.error(e));

    return () => {
      cancelled = true;
    };
  }, [filterType, items, metaCache, normalizedQuery]);

  // Prefetch metadata for the current search viewport (so scrolled-down results can show meanings without tapping)
  useEffect(() => {
    if (!normalizedQuery) return;

    const start = listViewportStart.search ?? 0;
    const windowed = combinedSearchResults.slice(start, start + 80);
    const missingKeys = windowed.map((i) => `${i.type}:${i.display}`).filter((k) => !metaCache[k]);
    if (!missingKeys.length) return;

    let cancelled = false;
    (async () => {
      const additions: Record<string, MetaCacheEntry> = {};
      let processed = 0;
      for (const key of missingKeys) {
        if (cancelled) return;
        const [type, display] = key.split(':', 2) as [ItemType, string];
        if (type === 'kanji') {
          const info = await lookupKanjiNormalized(display);
          const meaning = info?.meanings?.filter(Boolean).join(', ');
          additions[key] = {
            meaning: meaning || undefined,
            onyomi: info?.readings?.onyomi?.join(' ') || undefined,
            kunyomi: info?.readings?.kunyomi?.join(' ') || undefined,
          };
        } else {
          const info = await lookupWordFlexible(display);
          const meaning = info?.meaning?.filter(Boolean).join(', ');
          additions[key] = {
            meaning: meaning || undefined,
            reading: info?.reading || undefined,
          };
        }

        processed++;
        if (processed % 10 === 0) await new Promise((r) => setTimeout(r, 0));
      }

      if (cancelled) return;
      if (Object.keys(additions).length) setMetaCache((prev) => ({ ...prev, ...additions }));
    })().catch((e) => console.error(e));

    return () => {
      cancelled = true;
    };
  }, [combinedSearchResults, listViewportStart.search, metaCache, normalizedQuery]);

  // Ensure metadata for words spotted
  useEffect(() => {
    const missing = detailWordsSpotted
      .map((w) => `word:${w.word}`)
      .filter((k) => !metaCache[k]);
    if (!missing.length) return;

    let cancelled = false;
    (async () => {
      const additions: Record<string, MetaCacheEntry> = {};
      for (const key of missing.slice(0, 120)) {
        if (cancelled) return;
        const word = key.slice('word:'.length);
        const info = await lookupWordFlexible(word);
        const meaning = info?.meaning?.filter(Boolean).join(', ');
        additions[key] = {
          meaning: meaning || undefined,
          reading: info?.reading || undefined,
        };
        if (Object.keys(additions).length % 10 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      if (cancelled) return;
      if (Object.keys(additions).length) {
        setMetaCache((prev) => ({ ...prev, ...additions }));
      }
    })().catch((e) => console.error(e));

    return () => {
      cancelled = true;
    };
  }, [detailWordsSpotted, metaCache]);

  // Ensure metadata for kanji shown in the "Kanji in this word" modal
  useEffect(() => {
    if (!wordKanjiModal.visible) return;
    if (!wordKanjiModal.kanji.length) return;

    const missing = wordKanjiModal.kanji.map((k) => `kanji:${k}`).filter((key) => !metaCache[key]);
    if (!missing.length) return;

    let cancelled = false;
    (async () => {
      const additions: Record<string, MetaCacheEntry> = {};
      for (const key of missing.slice(0, 60)) {
        if (cancelled) return;
        const kanji = key.slice('kanji:'.length);
        const info = await lookupKanjiNormalized(kanji);
        const meaning = info?.meanings?.filter(Boolean).join(', ');
        additions[key] = {
          meaning: meaning || undefined,
        };
        if (Object.keys(additions).length % 10 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      if (cancelled) return;
      if (Object.keys(additions).length) {
        setMetaCache((prev) => ({ ...prev, ...additions }));
      }
    })().catch((e) => console.error(e));

    return () => {
      cancelled = true;
    };
  }, [metaCache, wordKanjiModal.kanji, wordKanjiModal.visible]);

  const loadPhotosForDetail = useCallback(async (d: DetailInfo): Promise<PhotoEntry[]> => {
    if (d.type === 'kanji') return await getPhotosForKanji(d.id);
    const aliases = d.wordAliases?.length ? d.wordAliases : [d.id];
    const lists = await Promise.all(aliases.map((w) => getPhotosForWord(w)));
    const uniq = new Map<number, PhotoEntry>();
    for (const arr of lists) {
      for (const p of arr) uniq.set(p.id, p);
    }
    return Array.from(uniq.values()).sort((a, b) => b.created_at - a.created_at);
  }, []);

  const openDetail = useCallback(async (type: ItemType, id: string, wordAliases?: string[]) => {
    await runWithUiBusy('Loading…', async () => {
      // Push current state to history before navigating
      navHistoryRef.current.push(captureNavEntry());

      // If the full-image overlay is open, close it now (it is preserved in history for Back).
      if (fullImagePhotoRef.current) {
        setFullImageMenuVisible(false);
        setFullImagePhoto(null);
        setFullImageMeta(null);
      }
      
      setDetailLoading(true);
      setDetail({ type, id, wordAliases });
      setScreen('detail');
      setDetailPhotos([]);
      const photos = await loadPhotosForDetail({ type, id, wordAliases });
      setDetailPhotos(photos);
      setDetailWordInfo(null);
      setDetailKanjiInfo(null);
      setDetailWordsSpotted([]);
      setWordKanjiModal({ visible: false, kanji: [] });

      if (type === 'kanji' && isKanji(id)) {
        const info = await lookupKanjiNormalized(id);
        setDetailKanjiInfo(info ? { readings: info.readings, meanings: info.meanings } : null);

        const wordEntries = await getWordsContainingKanji(id, 60);
        setDetailWordsSpotted(wordEntries);
        setDetailLoading(false);
        return;
      }

      if (type === 'word') {
        const w = await lookupWordFlexible(id);
        setDetailWordInfo(w ? { reading: w.reading, meaning: w.meaning } : null);
        const uniq: string[] = [];
        for (const ch of id) {
          if (!isKanji(ch)) continue;
          if (!uniq.includes(ch)) uniq.push(ch);
        }
        setWordKanjiModal({ visible: false, kanji: uniq });
      }

      setDetailLoading(false);
    });
  }, [captureNavEntry, loadPhotosForDetail, runWithUiBusy]);

  const openGallery = useCallback(async () => {
    await runWithUiBusy('Loading gallery…', async () => {
      // Push current state to history before navigating
      navHistoryRef.current.push(captureNavEntry());
      await reloadGallery();
      setScreen('gallery');
    });
  }, [captureNavEntry, reloadGallery, runWithUiBusy]);

  const openFullImage = useCallback(async (photo: PhotoEntry) => {
    setFullImagePhoto(photo);
    setFullImageMenuVisible(false);
    setFullImageMenuTab('kanji');
    setFullImageMenuScrollY({ kanji: 0, word: 0 });
    const kanji = await getKanjiForPhoto(photo.id);
    const words = await getWordsForPhoto(photo.id);
    setFullImageMeta({ kanji, words });
    ensureMetaForKeys([...kanji.map((k) => `kanji:${k}`), ...words.map((w) => `word:${w}`)]).catch((e) => console.error(e));
  }, [ensureMetaForKeys]);

  const openEditForPhoto = useCallback(async (photo: PhotoEntry) => {
    const kanji = await getKanjiForPhoto(photo.id);
    const words = await getWordsForPhoto(photo.id);
    setEditModal({
      visible: true,
      photo,
      kanjiText: kanji.join(''),
      wordsText: words.join('、'),
    });
  }, []);

  const saveEditForPhoto = useCallback(async () => {
    if (!editModal.photo) return;
    const photo = editModal.photo;

    const kanjiCounts: Record<string, number> = {};
    for (const ch of editModal.kanjiText) {
      if (!isKanji(ch)) continue;
      kanjiCounts[ch] = (kanjiCounts[ch] ?? 0) + 1;
    }

    const wordCounts: Record<string, number> = {};
    const parts = editModal.wordsText
      .split(/[、,\n\r\t ]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const w of parts) wordCounts[w] = (wordCounts[w] ?? 0) + 1;

    setProcessing(true);
    try {
      await setPhotoKanjiCounts(photo.id, photo.type, kanjiCounts);
      await setPhotoWordCounts(photo.id, photo.type, wordCounts);

      await reloadList();
      if (screen === 'gallery') await reloadGallery();
      if (screen === 'detail' && detail) {
        const photos = await loadPhotosForDetail(detail);
        setDetailPhotos(photos);
      }
      setEditModal({ visible: false, photo: null, kanjiText: '', wordsText: '' });
    } finally {
      setProcessing(false);
    }
  }, [detail, editModal, loadPhotosForDetail, reloadGallery, reloadList, screen]);

  const applyEditsForPhoto = useCallback(
    async (photo: PhotoEntry, kanji: string[], words: string[]) => {
      const kanjiCounts: Record<string, number> = {};
      for (const ch of kanji) {
        if (!isKanji(ch)) continue;
        kanjiCounts[ch] = (kanjiCounts[ch] ?? 0) + 1;
      }

      const wordCounts: Record<string, number> = {};
      for (const w of words.map((s) => s.trim()).filter(Boolean)) {
        wordCounts[w] = (wordCounts[w] ?? 0) + 1;
      }

      setProcessing(true);
      try {
        await setPhotoKanjiCounts(photo.id, photo.type, kanjiCounts);
        await setPhotoWordCounts(photo.id, photo.type, wordCounts);

        await reloadList();
        if (screen === 'gallery') await reloadGallery();
        if (screen === 'detail' && detail) {
          const photos = await loadPhotosForDetail(detail);
          setDetailPhotos(photos);
        }

        const nextKanji = await getKanjiForPhoto(photo.id);
        const nextWords = await getWordsForPhoto(photo.id);
        if (fullImagePhoto?.id === photo.id) {
          setFullImageMeta({ kanji: nextKanji, words: nextWords });
          ensureMetaForKeys([...nextKanji.map((k) => `kanji:${k}`), ...nextWords.map((w) => `word:${w}`)]).catch((e) => console.error(e));
        }
      } finally {
        setProcessing(false);
      }
    },
    [detail, fullImagePhoto?.id, loadPhotosForDetail, reloadGallery, reloadList, screen, ensureMetaForKeys]
  );

  const reprocessPhoto = useCallback(
    async (photo: PhotoEntry) => {
      setProcessingPhotoType(photo.type);
      setProcessing(true);
      setProcessingStatus('Reprocessing…');
      try {
        // Clear previous per-photo associations first.
        await setPhotoKanjiCounts(photo.id, photo.type, {});
        await setPhotoWordCounts(photo.id, photo.type, {});

        const ocrText = await processImage(photo.uri, photo.type === 'practice');
        const { kanjiCounts, wordCounts } = await extractKanjiAndWordsWithCountsSmart(ocrText);

        if (Object.keys(kanjiCounts).length) await setPhotoKanjiCounts(photo.id, photo.type, kanjiCounts);
        if (Object.keys(wordCounts).length) await setPhotoWordCounts(photo.id, photo.type, wordCounts);

        // Refresh list/gallery/detail views that depend on counts and associations.
        await reloadList();
        if (screen === 'gallery') await reloadGallery();
        if (screen === 'detail' && detail) {
          const photos = await loadPhotosForDetail(detail);
          setDetailPhotos(photos);
        }

        // Refresh the full image meta (if currently open).
        const kanji = await getKanjiForPhoto(photo.id);
        const words = await getWordsForPhoto(photo.id);
        if (fullImagePhoto?.id === photo.id) {
          setFullImageMeta({ kanji, words });
          ensureMetaForKeys([...kanji.map((k) => `kanji:${k}`), ...words.map((w) => `word:${w}`)]).catch((e) => console.error(e));
        }
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Failed to reprocess the photo.');
      } finally {
        setProcessing(false);
        setProcessingStatus('Processing…');
        setProcessingPhotoType(null);
      }
    },
    [detail, ensureMetaForKeys, fullImagePhoto?.id, loadPhotosForDetail, reloadGallery, reloadList, screen]
  );

  const onDeletePhoto = useCallback((photo: PhotoEntry) => {
    Alert.alert('Delete photo', 'Delete this photo and update counts?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePhoto(photo.id);
          await deletePhotoFromStorage(photo.uri);
          if (editModal.photo?.id === photo.id) setEditModal({ visible: false, photo: null, kanjiText: '', wordsText: '' });
          if (fullImagePhoto?.id === photo.id) {
            setFullImageMenuVisible(false);
            setFullImagePhoto(null);
            setFullImageMeta(null);
          }
          if (screen === 'gallery') await reloadGallery();
          if (screen === 'detail' && detail) {
            const photos = await loadPhotosForDetail(detail);
            setDetailPhotos(photos);
          }
          await reloadList();
        },
      },
    ]);
  }, [detail, editModal.photo, fullImagePhoto, loadPhotosForDetail, reloadGallery, reloadList, screen]);

  // Camera/gallery permissions
  const requestCameraPerms = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera permission is required.');
      return false;
    }
    return true;
  }, []);

  const requestMediaPerms = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Photo library permission is required.');
      return false;
    }
    return true;
  }, []);

  const processCapturedUri = useCallback(async (sourceUri: string, photoType: PhotoType) => {
    setProcessingPhotoType(photoType);
    setProcessing(true);
    setProcessingStatus('Processing 1/1…');
    try {
      const storedUri = await savePhotoToStorage(sourceUri);
      const ocrText = await processImage(storedUri, photoType === 'practice');
      const { kanji, words, kanjiCounts, wordCounts } = await extractKanjiAndWordsWithCountsSmart(ocrText);
      const photoId = await savePhoto(storedUri, photoType);
      if (Object.keys(kanjiCounts).length) await setPhotoKanjiCounts(photoId, photoType, kanjiCounts);
      if (Object.keys(wordCounts).length) await setPhotoWordCounts(photoId, photoType, wordCounts);
      await reloadList();
      Alert.alert('Saved', `Extracted ${kanji.length} kanji and ${words.length} words.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to process the photo.');
    } finally {
      setProcessing(false);
      setProcessingStatus('Processing…');
      setProcessingPhotoType(null);
    }
  }, [reloadList]);

  const processCapturedUris = useCallback(async (sourceUris: string[], photoType: PhotoType) => {
    if (!sourceUris.length) return;
    setProcessingPhotoType(photoType);
    setProcessing(true);
    const CONCURRENCY = 10;
    try {
      // Phase 1: Save photos to storage
      setProcessingStatus(`Preparing ${sourceUris.length} photos…`);
      const storedUris: string[] = [];
      for (const sourceUri of sourceUris) {
        storedUris.push(await savePhotoToStorage(sourceUri));
      }

      // Phase 2: Run OCR in parallel batches
      let ocrCompleted = 0;
      type OcrResult = { storedUri: string; ocrText: string; kanji: string[]; words: string[]; kanjiCounts: Record<string, number>; wordCounts: Record<string, number> };
      const allResults: OcrResult[] = [];

      const runOcr = async (storedUri: string): Promise<OcrResult> => {
        const ocrText = await processImage(storedUri, photoType === 'practice');
        const { kanji, words, kanjiCounts, wordCounts } = await extractKanjiAndWordsWithCountsSmart(ocrText);
        ocrCompleted++;
        setProcessingStatus(`Running OCR ${ocrCompleted}/${storedUris.length}…`);
        return { storedUri, ocrText, kanji, words, kanjiCounts, wordCounts };
      };

      for (let i = 0; i < storedUris.length; i += CONCURRENCY) {
        const batch = storedUris.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(batch.map(runOcr));
        allResults.push(...batchResults);
      }

      // Phase 3: Save to database sequentially
      setProcessingStatus(`Saving to database…`);
      let totalKanji = 0;
      let totalWords = 0;
      for (const r of allResults) {
        const photoId = await savePhoto(r.storedUri, photoType);
        if (Object.keys(r.kanjiCounts).length) await setPhotoKanjiCounts(photoId, photoType, r.kanjiCounts);
        if (Object.keys(r.wordCounts).length) await setPhotoWordCounts(photoId, photoType, r.wordCounts);
        totalKanji += r.kanji.length;
        totalWords += r.words.length;
      }

      await reloadList();
      Alert.alert('Saved', `Imported ${sourceUris.length} photos. Extracted ${totalKanji} kanji and ${totalWords} words total.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to process one of the selected photos.');
    } finally {
      setProcessing(false);
      setProcessingStatus('Processing…');
      setProcessingPhotoType(null);
    }
  }, [reloadList]);

  const captureFromCamera = useCallback(async (photoType: PhotoType) => {
    const ok = await requestCameraPerms();
    if (!ok) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) return;
    await processCapturedUri(result.assets[0].uri, photoType);
  }, [processCapturedUri, requestCameraPerms]);

  const pickFromGallery = useCallback(async (photoType: PhotoType) => {
    const ok = await requestMediaPerms();
    if (!ok) return;
    setPickerBusy(true);
    setPickerBusyPhotoType(photoType);
    setProcessingPhotoType(photoType);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 0,
      quality: 0.8,
    });
    if (result.canceled) {
      setPickerBusy(false);
      setPickerBusyPhotoType(null);
      setProcessingPhotoType(null);
      return;
    }
    const uris = result.assets.map((a) => a.uri).filter(Boolean);
    if (!uris.length) {
      setPickerBusy(false);
      setPickerBusyPhotoType(null);
      setProcessingPhotoType(null);
      return;
    }
    setProcessing(true);
    setProcessingStatus(`Loading ${uris.length} photo${uris.length > 1 ? 's' : ''}…`);
    setPickerBusy(false);
    setPickerBusyPhotoType(null);
    // Yield to allow UI to render loading state before heavy work
    await new Promise((r) => setTimeout(r, 50));
    if (uris.length <= 1) {
      await processCapturedUri(uris[0], photoType);
    } else {
      await processCapturedUris(uris, photoType);
    }
  }, [processCapturedUri, processCapturedUris, requestMediaPerms]);

  const listValue: ListContextType = useMemo(
    () => ({
      loading,
      searchQuery,
      setSearchQuery,
      sortMethod,
      sortDir,
      filterType,
      setSortMethod,
      setSortDir,
      setFilterTypeAndPersist,
      filteredSortedByType,
      combinedSearchResults,
      normalizedQuery,
      metaCache,
      setListViewportStart,
      openDetail,
      reloadList,
      setCaptureModal,
    }),
    [
      loading,
      searchQuery,
      setSearchQuery,
      sortMethod,
      sortDir,
      filterType,
      setSortMethod,
      setSortDir,
      setFilterTypeAndPersist,
      filteredSortedByType,
      combinedSearchResults,
      normalizedQuery,
      metaCache,
      setListViewportStart,
      openDetail,
      reloadList,
      setCaptureModal,
    ]
  );

  const value: AppContextType = {
    screen,
    setScreen,
    goBack,
    items,
    loading,
    reloadList,
    sortMethod,
    sortDir,
    filterType,
    searchQuery,
    setSearchQuery,
    setSortMethod,
    setSortDir,
    setFilterTypeAndPersist,
    galleryType,
    setGalleryType,
    allPhotos,
    galleryLoading,
    reloadGallery,
    openGallery,
    detail,
    detailPhotos,
    detailKanjiInfo,
    detailWordInfo,
    detailWordsSpotted,
    detailLoading,
    openDetail,
    metaCache,
    editModal,
    setEditModal,
    captureModal,
    setCaptureModal,
    wordKanjiModal,
    setWordKanjiModal,
    fullImagePhoto,
    setFullImagePhoto,
    fullImageMeta,
    setFullImageMeta,
    fullImageMenuVisible,
    setFullImageMenuVisible,
    fullImageMenuTab,
    setFullImageMenuTab,
    fullImageMenuScrollY,
    setFullImageMenuScrollY,
    processing,
    processingStatus,
    processingPhotoType,
    pickerBusy,
    pickerBusyPhotoType,
    uiBusy,
    uiBusyLabel,
    hiddenKanjiItems,
    hiddenWordGroups,
    loadHiddenItems,
    openFullImage,
    openEditForPhoto,
    saveEditForPhoto,
    applyEditsForPhoto,
    reprocessPhoto,
    onDeletePhoto,
    captureFromCamera,
    pickFromGallery,
    filteredSortedByType,
    filteredSorted,
    combinedSearchResults,
    normalizedQuery,
  };

  return (
    <AppContext.Provider value={value}>
      <ListContext.Provider value={listValue}>{children}</ListContext.Provider>
    </AppContext.Provider>
  );
}

