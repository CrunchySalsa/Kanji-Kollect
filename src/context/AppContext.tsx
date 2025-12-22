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
  updatePhotoUri,
  getKanjiList,
  getKanjiCount,
  getKanjiListPaged,
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
  unhideKanji,
  unhideWord,
  getAllPhotos,
  getWordGroupsList,
  getWordGroupsCount,
  getWordGroupsListPaged,
  getHiddenWordGroupsList,
  backfillWordDisplayBatch,
} from '../../services/database';
import { savePhotoToStorage, deletePhotoFromStorage } from '../../services/photoStorage';
import { processImage, OcrError } from '../../services/ocr';
import { extractKanjiAndWordsWithCountsSmart, isKanji } from '../../utils/kanjiExtractor';
import { getPreference, setPreference, removePreference } from '../../utils/preferences';
import { lookupKanjiNormalized, lookupWordFlexible, lookupKanjiBatch, lookupWordBatch } from '../../services/dictionary';
import { ensureDictionarySqliteStarted } from '../../services/dictionarySqlite';
import { useUiBusy } from '../hooks';

interface NavHistoryEntry {
  screen: Screen;
  detail: DetailInfo | null;
  fullImageSnapshot?: {
    photo: PhotoEntry | null;
    photos: PhotoEntry[];
    index: number;
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
  // API key
  apiKey: string | null;
  apiKeyLoading: boolean;
  setApiKey: (key: string) => Promise<void>;

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
  fullImagePhotos: PhotoEntry[];
  fullImageIndex: number;
  setFullImageIndex: (index: number) => Promise<void>;
  fullImageMeta: FullImageMeta | null;
  setFullImageMeta: React.Dispatch<React.SetStateAction<FullImageMeta | null>>;
  fullImageMenuVisible: boolean;
  setFullImageMenuVisible: React.Dispatch<React.SetStateAction<boolean>>;
  fullImageMenuTab: 'kanji' | 'word';
  setFullImageMenuTab: React.Dispatch<React.SetStateAction<'kanji' | 'word'>>;
  fullImageMenuScrollY: { kanji: number; word: number };
  setFullImageMenuScrollY: React.Dispatch<React.SetStateAction<{ kanji: number; word: number }>>;
  closeFullImageViewer: () => void;

  // Processing state
  processing: boolean;
  processingStatus: string;
  processingPhotoType: PhotoType | null;
  pickerBusy: boolean;
  pickerBusyPhotoType: PhotoType | null;

  // Initial load progress
  initialLoadVisible: boolean;
  initialLoadLabel: string;
  initialLoadProgress: number;

  // UI Busy
  uiBusy: boolean;
  uiBusyLabel: string;

  // Hidden items (settings)
  hiddenKanjiItems: KanjiEntry[];
  hiddenWordGroups: { display: string; aliases: string[] }[];
  loadHiddenItems: () => Promise<void>;

  // Actions
  openFullImage: (photo: PhotoEntry, opts?: { photos?: PhotoEntry[]; startIndex?: number }) => Promise<void>;
  openEditForPhoto: (photo: PhotoEntry) => Promise<void>;
  saveEditForPhoto: () => Promise<void>;
  applyEditsForPhoto: (photo: PhotoEntry, kanji: string[], words: string[]) => Promise<void>;
  reprocessPhoto: (photo: PhotoEntry) => Promise<void>;
  retakePhoto: (photo: PhotoEntry) => void;
  retakeFromCamera: (photo: PhotoEntry) => Promise<void>;
  retakeFromGallery: (photo: PhotoEntry) => Promise<void>;
  deletePhotos: (photos: PhotoEntry[]) => Promise<void>;
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
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('list');
  const [items, setItems] = useState<ListItem[]>([]);
  const itemsRef = useRef<ListItem[]>([]);
  const navHistoryRef = useRef<NavHistoryEntry[]>([]);
  const screenRef = useRef<Screen>('list');
  const detailRef = useRef<DetailInfo | null>(null);
  const [sortMethod, setSortMethodState] = useState<SortMethod>('priority');
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
  const [fullImagePhotos, setFullImagePhotos] = useState<PhotoEntry[]>([]);
  const [fullImageIndex, setFullImageIndexState] = useState(0);
  const [fullImageMeta, setFullImageMeta] = useState<FullImageMeta | null>(null);
  const [fullImageMenuVisible, setFullImageMenuVisible] = useState(false);
  const [fullImageMenuTab, setFullImageMenuTab] = useState<'kanji' | 'word'>('kanji');
  const [fullImageMenuScrollY, setFullImageMenuScrollY] = useState<{ kanji: number; word: number }>({ kanji: 0, word: 0 });
  const fullImagePhotoRef = useRef<PhotoEntry | null>(null);
  const fullImagePhotosRef = useRef<PhotoEntry[]>([]);
  const fullImageIndexRef = useRef(0);
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
  const [initialLoadStatus, setInitialLoadStatus] = useState<{ visible: boolean; label: string; progress: number }>({
    visible: false,
    label: '',
    progress: 0,
  });
  const initialLoadTimer = useRef<NodeJS.Timeout | null>(null);

  const stopInitialLoadTicker = useCallback(() => {
    if (initialLoadTimer.current) {
      clearInterval(initialLoadTimer.current);
      initialLoadTimer.current = null;
    }
  }, []);

  const startInitialLoadTicker = useCallback(() => {
    stopInitialLoadTicker();
    initialLoadTimer.current = setInterval(() => {
      setInitialLoadStatus((prev) => {
        if (!prev.visible) return prev;
        // Gently creep toward 80% while the fetch is running.
        const next = Math.min(prev.progress + 0.015, 0.8);
        if (next <= prev.progress) return prev;
        return { ...prev, progress: next };
      });
    }, 450);
  }, [stopInitialLoadTicker]);

  const [hiddenKanjiItems, setHiddenKanjiItems] = useState<KanjiEntry[]>([]);
  const [hiddenWordGroups, setHiddenWordGroups] = useState<{ display: string; aliases: string[] }[]>([]);

  const { uiBusy, uiBusyLabel, runWithUiBusy } = useUiBusy();

  const ensureMetaForKeys = useCallback(
    async (keys: string[]) => {
      const uniq = Array.from(new Set(keys.filter(Boolean)));
      const missing = uniq.filter((k) => !metaCache[k]).slice(0, 200);
      if (!missing.length) return;

      // Split into kanji and word keys
      const kanjiChars: string[] = [];
      const wordDisplays: string[] = [];
      for (const key of missing) {
        const [type, display] = key.split(':', 2) as [ItemType, string];
        if (type === 'kanji') kanjiChars.push(display);
        else wordDisplays.push(display);
      }

      // Batch lookup in parallel
      const [kanjiMap, wordMap] = await Promise.all([
        lookupKanjiBatch(kanjiChars),
        lookupWordBatch(wordDisplays),
      ]);

      const additions: Record<string, MetaCacheEntry> = {};
      for (const ch of kanjiChars) {
        const info = kanjiMap.get(ch);
        const meaning = info?.meanings?.filter(Boolean).join(', ');
        const onyomi = info?.readings?.onyomi?.join(', ');
        const kunyomi = info?.readings?.kunyomi?.join(', ');
        additions[`kanji:${ch}`] = { meaning: meaning || undefined, onyomi: onyomi || undefined, kunyomi: kunyomi || undefined };
      }
      for (const w of wordDisplays) {
        const info = wordMap.get(w);
        const meaning = info?.meaning?.filter(Boolean).join(', ');
        additions[`word:${w}`] = { meaning: meaning || undefined, reading: info?.reading || undefined };
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
    itemsRef.current = items;
  }, [items]);

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
    return () => {
      stopInitialLoadTicker();
    };
  }, [stopInitialLoadTicker]);

  useEffect(() => {
    fullImagePhotoRef.current = fullImagePhoto;
  }, [fullImagePhoto]);

  useEffect(() => {
    fullImagePhotosRef.current = fullImagePhotos;
  }, [fullImagePhotos]);

  useEffect(() => {
    fullImageIndexRef.current = fullImageIndex;
  }, [fullImageIndex]);

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
      photos: fullImagePhotosRef.current,
      index: fullImageIndexRef.current,
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

  // Start one-time SQLite dictionary build after initial mount (non-blocking).
  useEffect(() => {
    const t = setTimeout(() => {
      ensureDictionarySqliteStarted().catch((e) => console.error(e));
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  // Load preferences on mount
  useEffect(() => {
    (async () => {
      const savedSort = await getPreference('sortMethod');
      const savedSortDir = await getPreference('sortDir');
      const savedFilter = await getPreference('filterType');
      const savedGalleryType = await getPreference('galleryType');
      const savedApiKey = await getPreference('apiKey');
      if (savedSort === 'encountered' || savedSort === 'practiced' || savedSort === 'mastery' || savedSort === 'priority') setSortMethodState(savedSort);
      if (savedSort === 'gap') setSortMethodState('priority');
      if (savedSortDir === 'asc' || savedSortDir === 'desc') setSortDirState(savedSortDir);
      if (savedFilter === 'kanji') setFilterType('kanji');
      if (savedFilter === 'word') setFilterType('word');
      if (savedFilter === 'words') setFilterType('word');
      if (savedGalleryType === 'encounter' || savedGalleryType === 'practice') setGalleryTypeState(savedGalleryType);
      setApiKeyState(savedApiKey);
      setApiKeyLoading(false);
    })().catch((e) => console.error(e));
  }, []);

  const setApiKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    setApiKeyState(trimmed || null);
    if (trimmed) {
      await setPreference('apiKey', trimmed);
    } else {
      await removePreference('apiKey');
    }
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
      setFullImagePhotos(prev.fullImageSnapshot.photos ?? []);
      setFullImageIndexState(prev.fullImageSnapshot.index ?? 0);
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
    const [hk, hwg] = await Promise.all([getHiddenKanjiList(), getHiddenWordGroupsList()]);
    setHiddenKanjiItems(hk);
    setHiddenWordGroups(hwg);
  }, []);

  useEffect(() => {
    if (screen === 'settings') {
      loadHiddenItems().catch((e) => console.error(e));
    }
  }, [loadHiddenItems, screen]);

  const reloadList = useCallback(async () => {
    const isInitial = itemsRef.current.length === 0;
    if (isInitial) {
      setLoading(true);
      setInitialLoadStatus({ visible: true, label: 'Loading kanji…', progress: 0.05 });
    }

    let kanji: Awaited<ReturnType<typeof getKanjiList>>;
    let wordGroups: Awaited<ReturnType<typeof getWordGroupsList>>;

    if (isInitial) {
      const PAGE_SIZE = 400;
      const totalKanji = await getKanjiCount();
      const totalWordGroups = await getWordGroupsCount();
      const totalRows = Math.max(1, totalKanji + totalWordGroups);
      let kanjiLoaded = 0;
      let wordLoaded = 0;

      const nextItems: ListItem[] = [];

      const updateProgress = (label: string) => {
        const progress = Math.min(0.99, (kanjiLoaded + wordLoaded) / totalRows);
        setInitialLoadStatus({ visible: true, label, progress });
      };

      // Load kanji in pages
      while (kanjiLoaded < totalKanji) {
        const page = await getKanjiListPaged(PAGE_SIZE, kanjiLoaded);
        if (!page.length) break;
        nextItems.push(
          ...page.map((k) => ({
            type: 'kanji' as const,
            key: `kanji:${k.character}`,
            display: k.character,
            encounter_count: k.encounter_count,
            practice_count: k.practice_count,
          }))
        );
        kanjiLoaded += page.length;
        updateProgress('Loading kanji…');
        setItems([...nextItems]);
        await new Promise((r) => setTimeout(r, 0));
      }

      // Load words in pages
      while (wordLoaded < totalWordGroups) {
        const page = await getWordGroupsListPaged(PAGE_SIZE, wordLoaded);
        if (!page.length) break;
        nextItems.push(
          ...page.map((g) => ({
            type: 'word' as const,
            key: `word:${g.display}`,
            display: g.display,
            encounter_count: g.encounter_count,
            practice_count: g.practice_count,
            wordAliases: g.aliases,
          }))
        );
        wordLoaded += page.length;
        updateProgress('Loading words…');
        setItems([...nextItems]);
        await new Promise((r) => setTimeout(r, 0));
      }

      kanji = nextItems.filter((i) => i.type === 'kanji').map((i) => ({
        character: i.display,
        encounter_count: i.encounter_count,
        practice_count: i.practice_count,
      }));
      wordGroups = nextItems
        .filter((i) => i.type === 'word')
        .map((i) => ({
          display: i.display,
          encounter_count: i.encounter_count,
          practice_count: i.practice_count,
          aliases: (i as any).wordAliases ?? [],
        }));
      updateProgress('Finalizing…');
    } else {
      [kanji, wordGroups] = await Promise.all([getKanjiList(), getWordGroupsList()]);
    }

    const nextItems: ListItem[] = [
      ...kanji.map((k) => ({
        type: 'kanji' as const,
        key: `kanji:${k.character}`,
        display: k.character,
        encounter_count: k.encounter_count,
        practice_count: k.practice_count,
      })),
      ...wordGroups.map((g) => ({
        type: 'word' as const,
        key: `word:${g.display}`,
        display: g.display,
        encounter_count: g.encounter_count,
        practice_count: g.practice_count,
        wordAliases: g.aliases,
      })),
    ];

    // Ensure meanings/readings exist for the initial/top viewport BEFORE swapping the list,
    // so items never render without meanings.
    const dir = sortDir === 'desc' ? 1 : -1;
    const cmp = (a: ListItem, b: ListItem) => {
      if (sortMethod === 'encountered') return (b.encounter_count - a.encounter_count) * dir;
      if (sortMethod === 'practiced') return (b.practice_count - a.practice_count) * dir;
      if (sortMethod === 'mastery' || sortMethod === 'priority') {
        const k = 10;
        const aSeen = a.encounter_count;
        const bSeen = b.encounter_count;
        if (aSeen === 0 && bSeen !== 0) return 1;
        if (bSeen === 0 && aSeen !== 0) return -1;
        if (aSeen === 0 && bSeen === 0) return (b.practice_count - a.practice_count) * dir;
        const wA = Math.log(1 + aSeen);
        const wB = Math.log(1 + bSeen);
        const rA = a.practice_count / (aSeen + k);
        const rB = b.practice_count / (bSeen + k);
        const aVal = sortMethod === 'mastery' ? wA * rA : wA * (1 - rA);
        const bVal = sortMethod === 'mastery' ? wB * rB : wB * (1 - rB);
        if (bVal !== aVal) return (bVal - aVal) * dir;
        if (sortMethod === 'mastery' && a.practice_count === 0 && b.practice_count === 0) return bSeen - aSeen;
        return (b.encounter_count - a.encounter_count) * dir;
      }
      return 0;
    };

    const nextKanjiTop = nextItems
      .filter((i) => i.type === 'kanji')
      .sort(cmp)
      .slice(0, 40)
      .map((i) => `kanji:${i.display}`);
    const nextWordTop = nextItems
      .filter((i) => i.type === 'word')
      .sort(cmp)
      .slice(0, 40)
      .map((i) => `word:${i.display}`);

    setItems(nextItems);
    if (isInitial) {
      setInitialLoadStatus((s) => ({ ...s, progress: Math.max(s.progress, 0.95), label: 'Finalizing…' }));
      setLoading(false);
      (async () => {
        try {
          await ensureMetaForKeys([...nextKanjiTop, ...nextWordTop]);
        } finally {
          stopInitialLoadTicker();
          setInitialLoadStatus({ visible: false, label: '', progress: 1 });
        }
      })().catch((e) => console.error(e));
    } else {
      await ensureMetaForKeys([...nextKanjiTop, ...nextWordTop]);
    }
  }, [ensureMetaForKeys, sortDir, sortMethod, startInitialLoadTicker, stopInitialLoadTicker]);

  // One-time backfill for existing installs: populate cached word display values in small batches.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      (async () => {
        // Limit work per tick; loop until no more rows need backfill.
        while (!cancelled) {
          const n = await backfillWordDisplayBatch(150);
          if (n <= 0) break;
          await new Promise((r) => setTimeout(r, 0));
        }
        if (!cancelled) {
          await reloadList();
        }
      })().catch((e) => console.error(e));
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [reloadList]);

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
        if (sortMethod === 'mastery' || sortMethod === 'priority') {
          const k = 10;
          const aSeen = a.encounter_count;
          const bSeen = b.encounter_count;
          if (aSeen === 0 && bSeen !== 0) return 1;
          if (bSeen === 0 && aSeen !== 0) return -1;
          if (aSeen === 0 && bSeen === 0) return (b.practice_count - a.practice_count) * dir;
          const wA = Math.log(1 + aSeen);
          const wB = Math.log(1 + bSeen);
          const rA = a.practice_count / (aSeen + k);
          const rB = b.practice_count / (bSeen + k);
          const aVal = sortMethod === 'mastery' ? wA * rA : wA * (1 - rA);
          const bVal = sortMethod === 'mastery' ? wB * rB : wB * (1 - rB);
          if (bVal !== aVal) return (bVal - aVal) * dir;
          if (sortMethod === 'mastery' && a.practice_count === 0 && b.practice_count === 0) return bSeen - aSeen;
          return (b.encounter_count - a.encounter_count) * dir;
        }
        return 0;
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
      if (sortMethod === 'mastery' || sortMethod === 'priority') {
        const k = 10;
        const aSeen = a.encounter_count;
        const bSeen = b.encounter_count;
        if (aSeen === 0 && bSeen !== 0) return 1;
        if (bSeen === 0 && aSeen !== 0) return -1;
        if (aSeen === 0 && bSeen === 0) return (b.practice_count - a.practice_count) * dir;
        const wA = Math.log(1 + aSeen);
        const wB = Math.log(1 + bSeen);
        const rA = a.practice_count / (aSeen + k);
        const rB = b.practice_count / (bSeen + k);
        const aVal = sortMethod === 'mastery' ? wA * rA : wA * (1 - rA);
        const bVal = sortMethod === 'mastery' ? wB * rB : wB * (1 - rB);
        if (bVal !== aVal) return (bVal - aVal) * dir;
        if (sortMethod === 'mastery' && a.practice_count === 0 && b.practice_count === 0) return bSeen - aSeen;
        return (b.encounter_count - a.encounter_count) * dir;
      }
      return 0;
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

  const loadFullImageMeta = useCallback(
    async (photo: PhotoEntry) => {
      const kanji = await getKanjiForPhoto(photo.id);
      const words = await getWordsForPhoto(photo.id);
      setFullImageMeta({ kanji, words });
      ensureMetaForKeys([...kanji.map((k) => `kanji:${k}`), ...words.map((w) => `word:${w}`)]).catch((e) => console.error(e));
    },
    [ensureMetaForKeys]
  );

  const openFullImage = useCallback(
    async (photo: PhotoEntry, opts?: { photos?: PhotoEntry[]; startIndex?: number }) => {
      const list =
        opts?.photos && opts.photos.length
          ? opts.photos
          : allPhotos && allPhotos.length
            ? allPhotos
            : [photo];
      const requestedIndex = opts?.startIndex ?? list.findIndex((p) => p.id === photo.id);
      const safeIndex = requestedIndex >= 0 ? requestedIndex : 0;
      const nextPhoto = list[safeIndex] ?? photo;

      setFullImagePhotos(list);
      setFullImageIndexState(safeIndex);
      setFullImagePhoto(nextPhoto);
      setFullImageMenuVisible(false);
      setFullImageMenuTab('kanji');
      setFullImageMenuScrollY({ kanji: 0, word: 0 });
      await loadFullImageMeta(nextPhoto);
    },
    [allPhotos, loadFullImageMeta]
  );

  const setFullImageIndex = useCallback(
    async (nextIndex: number) => {
      const list = fullImagePhotosRef.current;
      if (!list.length) return;
      const clamped = Math.max(0, Math.min(nextIndex, list.length - 1));
      const nextPhoto = list[clamped];
      setFullImageIndexState(clamped);
      setFullImagePhoto(nextPhoto);
      setFullImageMenuScrollY({ kanji: 0, word: 0 });
      setFullImageMenuVisible(false);
      setFullImageMenuTab('kanji');
      await loadFullImageMeta(nextPhoto);
    },
    [loadFullImageMeta]
  );

  const closeFullImageViewer = useCallback(() => {
    setFullImageMenuVisible(false);
    setFullImagePhoto(null);
    setFullImageMeta(null);
    setFullImagePhotos([]);
    setFullImageIndexState(0);
    setFullImageMenuScrollY({ kanji: 0, word: 0 });
  }, []);

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

        const ocrText = await processImage(photo.uri, apiKey, photo.type === 'practice');
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
        const message = e instanceof OcrError ? e.message : 'Failed to reprocess the photo.';
        Alert.alert('Error', message);
      } finally {
        setProcessing(false);
        setProcessingStatus('Processing…');
        setProcessingPhotoType(null);
      }
    },
    [apiKey, detail, ensureMetaForKeys, fullImagePhoto?.id, loadPhotosForDetail, reloadGallery, reloadList, screen]
  );

  const replacePhotoWithSource = useCallback(
    async (photo: PhotoEntry, sourceUri: string) => {
      setProcessingPhotoType(photo.type);
      setProcessing(true);
      setProcessingStatus('Replacing photo…');
      const updatedAt = Date.now();
      try {
        const storedUri = await savePhotoToStorage(sourceUri);

        // Clear prior associations before re-running OCR.
        await setPhotoKanjiCounts(photo.id, photo.type, {});
        await setPhotoWordCounts(photo.id, photo.type, {});

        const ocrText = await processImage(storedUri, apiKey, photo.type === 'practice');
        const { kanjiCounts, wordCounts } = await extractKanjiAndWordsWithCountsSmart(ocrText);

        await updatePhotoUri(photo.id, storedUri, updatedAt);

        if (Object.keys(kanjiCounts).length) {
          await setPhotoKanjiCounts(photo.id, photo.type, kanjiCounts);
        }
        if (Object.keys(wordCounts).length) {
          await setPhotoWordCounts(photo.id, photo.type, wordCounts);
        }

        const patchPhoto = (p: PhotoEntry | null): PhotoEntry | null =>
          p && p.id === photo.id ? { ...p, uri: storedUri, created_at: updatedAt } : p;

        setAllPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, uri: storedUri, created_at: updatedAt } : p)));
        setFullImagePhoto((p) => patchPhoto(p));
        setFullImagePhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, uri: storedUri, created_at: updatedAt } : p)));
        setDetailPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, uri: storedUri, created_at: updatedAt } : p)));

        await reloadList();
        if (screen === 'gallery') {
          await reloadGallery();
        }
        if (screen === 'detail' && detail) {
          const photos = await loadPhotosForDetail(detail);
          setDetailPhotos(photos);
        }

        const kanji = await getKanjiForPhoto(photo.id);
        const words = await getWordsForPhoto(photo.id);
        if (fullImagePhoto?.id === photo.id) {
          setFullImageMeta({ kanji, words });
          ensureMetaForKeys([...kanji.map((k) => `kanji:${k}`), ...words.map((w) => `word:${w}`)]).catch((e) => console.error(e));
        }

        await deletePhotoFromStorage(photo.uri);
      } catch (e) {
        console.error(e);
        const message = e instanceof OcrError ? e.message : 'Failed to replace the photo.';
        Alert.alert('Error', message);
      } finally {
        setProcessing(false);
        setProcessingStatus('Processing…');
        setProcessingPhotoType(null);
      }
    },
    [
      apiKey,
      detail,
      ensureMetaForKeys,
      fullImagePhoto?.id,
      loadPhotosForDetail,
      reloadGallery,
      reloadList,
      screen,
    ]
  );

  const deletePhotos = useCallback(
    async (photos: PhotoEntry[]) => {
      if (!photos.length) return;
      const count = photos.length;
      await runWithUiBusy(`Deleting ${count} photo${count === 1 ? '' : 's'}…`, async () => {
        // Delete sequentially to keep DB/storage operations simple and predictable.
        for (const photo of photos) {
          await deletePhoto(photo.id);
          await deletePhotoFromStorage(photo.uri);
        }

        // Close modals if they reference a deleted photo.
        if (editModal.photo?.id && photos.some((p) => p.id === editModal.photo?.id)) {
          setEditModal({ visible: false, photo: null, kanjiText: '', wordsText: '' });
        }
        if (fullImagePhoto?.id && photos.some((p) => p.id === fullImagePhoto?.id)) {
          setFullImageMenuVisible(false);
          setFullImagePhoto(null);
          setFullImageMeta(null);
        }

        // Refresh list/gallery/detail views that depend on photos and counts.
        if (screen === 'gallery') await reloadGallery();
        if (screen === 'detail' && detail) {
          const nextPhotos = await loadPhotosForDetail(detail);
          setDetailPhotos(nextPhotos);
        }
        await reloadList();
      });
    },
    [detail, editModal.photo, fullImagePhoto, loadPhotosForDetail, reloadGallery, reloadList, runWithUiBusy, screen]
  );

  const onDeletePhoto = useCallback(
    (photo: PhotoEntry) => {
      Alert.alert('Delete photo', 'Delete this photo and update counts?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePhotos([photo]);
          },
        },
      ]);
    },
    [deletePhotos]
  );

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
      const ocrText = await processImage(storedUri, apiKey, photoType === 'practice');
      const { kanji, words, kanjiCounts, wordCounts } = await extractKanjiAndWordsWithCountsSmart(ocrText);
      const photoId = await savePhoto(storedUri, photoType);
      if (Object.keys(kanjiCounts).length) await setPhotoKanjiCounts(photoId, photoType, kanjiCounts);
      if (Object.keys(wordCounts).length) await setPhotoWordCounts(photoId, photoType, wordCounts);
      await reloadList();
      Alert.alert('Saved', `Extracted ${kanji.length} kanji and ${words.length} words.`);
    } catch (e) {
      console.error(e);
      const message = e instanceof OcrError ? e.message : 'Failed to process the photo.';
      Alert.alert('Error', message);
    } finally {
      setProcessing(false);
      setProcessingStatus('Processing…');
      setProcessingPhotoType(null);
    }
  }, [apiKey, reloadList]);

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
        const ocrText = await processImage(storedUri, apiKey, photoType === 'practice');
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
      const message = e instanceof OcrError ? e.message : 'Failed to process one of the selected photos.';
      Alert.alert('Error', message);
    } finally {
      setProcessing(false);
      setProcessingStatus('Processing…');
      setProcessingPhotoType(null);
    }
  }, [apiKey, reloadList]);

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 0,
      quality: 0.8,
    });
    if (result.canceled) {
      setPickerBusy(false);
      setPickerBusyPhotoType(null);
      return;
    }
    const uris = result.assets.map((a) => a.uri).filter(Boolean);
    if (!uris.length) {
      setPickerBusy(false);
      setPickerBusyPhotoType(null);
      return;
    }
    setProcessingPhotoType(photoType);
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

  const retakeFromCamera = useCallback(
    async (photo: PhotoEntry) => {
      const ok = await requestCameraPerms();
      if (!ok) return;
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      await replacePhotoWithSource(photo, result.assets[0].uri);
    },
    [replacePhotoWithSource, requestCameraPerms]
  );

  const retakeFromGallery = useCallback(
    async (photo: PhotoEntry) => {
      const ok = await requestMediaPerms();
      if (!ok) return;
      setPickerBusy(true);
      setPickerBusyPhotoType(photo.type);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        selectionLimit: 1,
        quality: 0.8,
      });
      setPickerBusy(false);
      setPickerBusyPhotoType(null);
      if (result.canceled || !result.assets?.length) return;
      await replacePhotoWithSource(photo, result.assets[0].uri);
    },
    [replacePhotoWithSource, requestMediaPerms]
  );

  const retakePhoto = useCallback(
    (photo: PhotoEntry) => {
      Alert.alert('Replace photo', 'Capture a new photo or pick from gallery.', [
        { text: 'Camera', onPress: () => retakeFromCamera(photo) },
        { text: 'Upload', onPress: () => retakeFromGallery(photo) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [retakeFromCamera, retakeFromGallery]
  );

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
    apiKey,
    apiKeyLoading,
    setApiKey,
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
    fullImagePhotos,
    fullImageIndex,
    setFullImageIndex,
    fullImageMeta,
    setFullImageMeta,
    fullImageMenuVisible,
    setFullImageMenuVisible,
    fullImageMenuTab,
    setFullImageMenuTab,
    fullImageMenuScrollY,
    setFullImageMenuScrollY,
    closeFullImageViewer,
    processing,
    processingStatus,
    processingPhotoType,
    pickerBusy,
    pickerBusyPhotoType,
    initialLoadVisible: initialLoadStatus.visible,
    initialLoadLabel: initialLoadStatus.label,
    initialLoadProgress: initialLoadStatus.progress,
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
    retakePhoto,
    retakeFromCamera,
    retakeFromGallery,
    deletePhotos,
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

