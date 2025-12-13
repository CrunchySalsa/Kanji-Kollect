import 'react-native-gesture-handler';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  ActivityIndicator,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { toRomaji, isRomaji as isRomajiInput } from 'wanakana';
import * as Speech from 'expo-speech';
import { NavigationContainer, DrawerActions, useNavigation } from '@react-navigation/native';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';

import { initDatabase, savePhoto, addPhotoKanji, addPhotoWords, getKanjiList, getWordsList, getPhotosForKanji, getPhotosForWord, deletePhoto, PhotoEntry, getKanjiForPhoto, getWordsForPhoto, setPhotoKanjiCounts, setPhotoWordCounts, getWordsContainingKanji, WordEntry, KanjiEntry, hideKanji, hideWord, getHiddenKanjiList, getHiddenWordsList, unhideKanji, unhideWord } from './services/database';
import { savePhotoToStorage, deletePhotoFromStorage } from './services/photoStorage';
import { processImage } from './services/ocr';
import { extractKanjiAndWordsWithCounts, isKanji } from './utils/kanjiExtractor';
import { getPreference, setPreference } from './utils/preferences';
import { lookupKanjiNormalized, lookupWordFlexible } from './services/dictionary';

type ItemType = 'kanji' | 'word';
type SortMethod = 'gap' | 'encountered' | 'practiced';
type SortDir = 'desc' | 'asc';
type FilterType = 'kanji' | 'word';

type ListItem =
  | ({ type: 'kanji'; key: string; display: string; encounter_count: number; practice_count: number })
  | ({ type: 'word'; key: string; display: string; encounter_count: number; practice_count: number; wordAliases?: string[] });

type Screen = 'list' | 'gallery' | 'detail' | 'settings';

const Drawer = createDrawerNavigator();

function CustomDrawerContent(props: any) {
  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: '#0f0f1a' }}>
      <View style={styles.drawerHeader}>
        <Text style={styles.drawerTitle}>Nihongo Tracker</Text>
      </View>
      <DrawerItem
        label="Settings"
        labelStyle={styles.drawerItemLabel}
        style={styles.drawerItem}
        onPress={() => {
          props.navigation.closeDrawer();
          props.onOpenSettings();
        }}
      />
    </DrawerContentScrollView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppInner />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

function MainScreen({ onOpenSettings }: { onOpenSettings: (setScreen: (s: Screen) => void) => void }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const searchInputRef = useRef<any>(null);
  const [screen, setScreen] = useState<Screen>('list');

  useEffect(() => {
    onOpenSettings(setScreen);
  }, [onOpenSettings]);
  const [items, setItems] = useState<ListItem[]>([]);
  const [sortMethod, setSortMethod] = useState<SortMethod>('gap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterType, setFilterType] = useState<FilterType>('kanji');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [metaCache, setMetaCache] = useState<Record<string, { meaning?: string; reading?: string; onyomi?: string; kunyomi?: string }>>({});

  const [detail, setDetail] = useState<{ type: ItemType; id: string; wordAliases?: string[] } | null>(null);
  const [detailPhotos, setDetailPhotos] = useState<PhotoEntry[]>([]);
  const [detailKanjiInfo, setDetailKanjiInfo] = useState<{ readings: { onyomi: string[]; kunyomi: string[] }; meanings: string[] } | null>(null);
  const [detailWordInfo, setDetailWordInfo] = useState<{ reading: string; meaning: string[] } | null>(null);
  const [detailWordsSpotted, setDetailWordsSpotted] = useState<WordEntry[]>([]);
  const [wordKanjiModal, setWordKanjiModal] = useState<{ visible: boolean; kanji: string[] }>({ visible: false, kanji: [] });
  const [fullImagePhoto, setFullImagePhoto] = useState<PhotoEntry | null>(null);
  const [fullImageMeta, setFullImageMeta] = useState<{ kanji: string[]; words: string[] } | null>(null);
  const [fullImageMenuVisible, setFullImageMenuVisible] = useState(false);

  const [allPhotos, setAllPhotos] = useState<PhotoEntry[]>([]);
  const [galleryType, setGalleryType] = useState<'encounter' | 'practice'>('encounter');
  // (gallery photo meta modal removed; meta now lives in full-image viewer)
  const [editModal, setEditModal] = useState<{ visible: boolean; photo: PhotoEntry | null; kanjiText: string; wordsText: string }>({ visible: false, photo: null, kanjiText: '', wordsText: '' });
  const [captureModal, setCaptureModal] = useState<{ visible: boolean; photoType: 'encounter' | 'practice' | null }>({ visible: false, photoType: null });
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('Processing…');
  const [uiBusy, setUiBusy] = useState(false);
  const [uiBusyLabel, setUiBusyLabel] = useState<string>('Loading…');
  const [detailLoading, setDetailLoading] = useState(false);
  const [galleryLoading, setGalleryLoading] = useState(false);

  const [hiddenKanjiItems, setHiddenKanjiItems] = useState<KanjiEntry[]>([]);
  const [hiddenWordGroups, setHiddenWordGroups] = useState<{ display: string; aliases: string[] }[]>([]);

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
    initDatabase().catch((e) => console.error(e));
  }, []);

  const runWithUiBusy = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    setUiBusyLabel(label);
    setUiBusy(true);
    try {
      return await fn();
    } finally {
      setUiBusy(false);
      setUiBusyLabel('Loading…');
    }
  }, []);

  const speakJa = useCallback((text: string) => {
    if (!text) return;
    try {
      // Stop any previous utterance to avoid overlap.
      Speech.stop();
      Speech.speak(text, {
        language: 'ja-JP',
        rate: 0.95,
        pitch: 1.0,
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const uniqueReadings = useCallback((readings: string[]) => {
    // Some readings can repeat after normalization (e.g. punctuation stripped).
    // Deduplicate for display while preserving order.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of readings) {
      const v = r.trim();
      if (!v) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }, []);

  // Android hardware back button: go back to list instead of closing the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Close top-most UI first
      if (fullImageMenuVisible) {
        setFullImageMenuVisible(false);
        return true;
      }
      if (fullImagePhoto) {
        setFullImagePhoto(null);
        setFullImageMeta(null);
        return true;
      }
      if (editModal.visible) {
        setEditModal({ visible: false, photo: null, kanjiText: '', wordsText: '' });
        return true;
      }
      if (captureModal.visible) {
        setCaptureModal({ visible: false, photoType: null });
        return true;
      }

      if (uiBusy) {
        // Ignore back presses while a user-initiated load is in-flight.
        return true;
      }

      if (screen !== 'list') {
        setScreen('list');
        setDetail(null);
        return true;
      }

      // On list screen, allow default (exit app)
      return false;
    });
    return () => sub.remove();
  }, [captureModal.visible, detail, editModal.visible, fullImageMenuVisible, fullImagePhoto, screen, uiBusy]);

  useEffect(() => {
    if (screen === 'settings') {
      loadHiddenItems().catch((e) => console.error(e));
    }
  }, [loadHiddenItems, screen]);

  useEffect(() => {
    (async () => {
      const savedSort = await getPreference('sortMethod');
      const savedSortDir = await getPreference('sortDir');
      const savedFilter = await getPreference('filterType');
      const savedGalleryType = await getPreference('galleryType');
      if (savedSort === 'gap' || savedSort === 'encountered' || savedSort === 'practiced') setSortMethod(savedSort);
      if (savedSortDir === 'asc' || savedSortDir === 'desc') setSortDir(savedSortDir);
      // Migration: older builds stored 'words'; internally we use singular 'word' to match ItemType.
      if (savedFilter === 'kanji') setFilterType('kanji');
      if (savedFilter === 'word') setFilterType('word');
      if (savedFilter === 'words') setFilterType('word');
      if (savedGalleryType === 'encounter' || savedGalleryType === 'practice') setGalleryType(savedGalleryType);
    })().catch((e) => console.error(e));
  }, []);

  const setFilterTypeAndPersist = useCallback((t: FilterType) => {
    setFilterType(t);
    setPreference('filterType', t);
  }, []);

  const [listWidth, setListWidth] = useState(() => Dimensions.get('window').width);
  const listTranslateX = useRef(new Animated.Value(0)).current;
  const swipeBaseXRef = useRef(0);

  const clamp = useCallback((n: number, min: number, max: number) => Math.max(min, Math.min(max, n)), []);

  const activeIndex = filterType === 'kanji' ? 0 : 1;
  useEffect(() => {
    if (!listWidth) return;
    const target = -activeIndex * listWidth;
    Animated.timing(listTranslateX, {
      toValue: target,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, listTranslateX, listWidth]);

  const swipeResponder = useMemo(() => {
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => {
        if (!listWidth) return false;
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        if (ax < 10) return false;
        return ax > ay * 1.2;
      },
      onPanResponderGrant: () => {
        if (!listWidth) return;
        listTranslateX.stopAnimation();
        swipeBaseXRef.current = -activeIndex * listWidth;
      },
      onPanResponderMove: (_evt, g) => {
        if (!listWidth) return;
        const next = clamp(swipeBaseXRef.current + g.dx, -listWidth, 0);
        listTranslateX.setValue(next);
      },
      onPanResponderRelease: (_evt, g) => {
        if (!listWidth) return;
        const threshold = listWidth * 0.22;
        let nextIndex = activeIndex;
        if (g.dx <= -threshold || g.vx <= -0.55) nextIndex = 1;
        if (g.dx >= threshold || g.vx >= 0.55) nextIndex = 0;

        const nextType: FilterType = nextIndex === 0 ? 'kanji' : 'word';
        setFilterTypeAndPersist(nextType);

        Animated.timing(listTranslateX, {
          toValue: -nextIndex * listWidth,
          duration: 180,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        if (!listWidth) return;
        Animated.timing(listTranslateX, {
          toValue: -activeIndex * listWidth,
          duration: 180,
          useNativeDriver: true,
        }).start();
      },
    });
  }, [activeIndex, clamp, listTranslateX, listWidth, setFilterTypeAndPersist]);

  // Gallery swipe state
  const [galleryWidth, setGalleryWidth] = useState(() => Dimensions.get('window').width);
  const galleryTranslateX = useRef(new Animated.Value(0)).current;
  const gallerySwipeBaseXRef = useRef(0);

  const galleryActiveIndex = galleryType === 'encounter' ? 0 : 1;
  useEffect(() => {
    if (!galleryWidth) return;
    const target = -galleryActiveIndex * galleryWidth;
    Animated.timing(galleryTranslateX, {
      toValue: target,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [galleryActiveIndex, galleryTranslateX, galleryWidth]);

  const gallerySwipeResponder = useMemo(() => {
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => {
        if (!galleryWidth) return false;
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        if (ax < 10) return false;
        return ax > ay * 1.2;
      },
      onPanResponderGrant: () => {
        if (!galleryWidth) return;
        galleryTranslateX.stopAnimation();
        gallerySwipeBaseXRef.current = -galleryActiveIndex * galleryWidth;
      },
      onPanResponderMove: (_evt, g) => {
        if (!galleryWidth) return;
        const next = clamp(gallerySwipeBaseXRef.current + g.dx, -galleryWidth, 0);
        galleryTranslateX.setValue(next);
      },
      onPanResponderRelease: (_evt, g) => {
        if (!galleryWidth) return;
        const threshold = galleryWidth * 0.22;
        let nextIndex = galleryActiveIndex;
        if (g.dx <= -threshold || g.vx <= -0.55) nextIndex = 1;
        if (g.dx >= threshold || g.vx >= 0.55) nextIndex = 0;

        const nextType: 'encounter' | 'practice' = nextIndex === 0 ? 'encounter' : 'practice';
        setGalleryType(nextType);
        setPreference('galleryType', nextType);

        Animated.timing(galleryTranslateX, {
          toValue: -nextIndex * galleryWidth,
          duration: 180,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        if (!galleryWidth) return;
        Animated.timing(galleryTranslateX, {
          toValue: -galleryActiveIndex * galleryWidth,
          duration: 180,
          useNativeDriver: true,
        }).start();
      },
    });
  }, [galleryActiveIndex, clamp, galleryTranslateX, galleryWidth]);

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
    // Reuse getAllPhotos by querying both types via DB call
    // database.ts already has getAllPhotos; import avoided to keep this file focused.
    // Instead, load from detail queries when needed; for now, use a simple query path via detailPhotos.
    // We will implement gallery as "recent photos from selected items" only if necessary.
    // Minimal: show last 50 photos by reading from DB using getPhotosForKanji/Word is insufficient.
    // Therefore, use dynamic import to avoid circular changes if database.ts changes later.
    const db = await import('./services/database');
    const photos = await db.getAllPhotos();
    setAllPhotos(photos);
    setGalleryLoading(false);
  }, []);

  useEffect(() => {
    reloadList().catch((e) => console.error(e));
  }, [reloadList]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const romajiQuery = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return null;
    // Only treat as romaji if it is ASCII and looks like romaji (letters/numbers, spaces, hyphen, apostrophe).
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

          // Romaji matching against readings (kana -> romaji), for queries like "nori" matching "のり"
          if (romajiQuery) {
            const readingHay = [meta?.reading ?? '', meta?.onyomi ?? '', meta?.kunyomi ?? ''].join(' ');
            if (readingHay) {
              const r = toRomaji(readingHay).toLowerCase();
              if (r.includes(romajiQuery)) return true;
            }
            // Also match if the item itself is kana and its romaji matches.
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
        // gap/score
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

  // Combined search results (both kanji and words) when there's a query
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

  // Prefetch dictionary metadata for visible items to support inline meanings and robust search.
  useEffect(() => {
    const visible = filteredSorted.slice(0, 80);
    const missingKeys = visible
      .map((i) => `${i.type}:${i.display}`)
      .filter((k) => !metaCache[k]);
    if (!missingKeys.length) return;

    let cancelled = false;
    (async () => {
      const additions: Record<string, { meaning?: string; reading?: string; onyomi?: string; kunyomi?: string }> = {};
      let processed = 0;

      for (const key of missingKeys) {
        if (cancelled) return;
        const [type, display] = key.split(':', 2) as [ItemType, string];
        if (type === 'kanji') {
          const info = await lookupKanjiNormalized(display);
          const meaning = info?.meanings?.[0];
          additions[key] = {
            meaning: meaning ?? undefined,
            onyomi: info?.readings?.onyomi?.join(' ') || undefined,
            kunyomi: info?.readings?.kunyomi?.join(' ') || undefined,
          };
        } else {
          const info = await lookupWordFlexible(display);
          const meaning = info?.meaning?.[0];
          additions[key] = {
            meaning: meaning ?? undefined,
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
  }, [filteredSorted, metaCache]);

  // When searching, progressively fetch metadata for more items so "meaning/reading" searches work.
  useEffect(() => {
    if (!normalizedQuery) return;

    const candidates = items
      .filter((i) => i.type === filterType)
      .map((i) => `${i.type}:${i.display}`)
      .filter((k) => !metaCache[k]);

    if (!candidates.length) return;

    let cancelled = false;
    (async () => {
      const additions: Record<string, { meaning?: string; reading?: string; onyomi?: string; kunyomi?: string }> = {};
      let processed = 0;

      // Cap work per search to avoid long blocking. This will still progressively improve results.
      const maxLookups = 400;
      for (const key of candidates.slice(0, maxLookups)) {
        if (cancelled) return;
        const [type, display] = key.split(':', 2) as [ItemType, string];
        if (type === 'kanji') {
          const info = await lookupKanjiNormalized(display);
          const meaning = info?.meanings?.[0];
          additions[key] = {
            meaning: meaning ?? undefined,
            onyomi: info?.readings?.onyomi?.join(' ') || undefined,
            kunyomi: info?.readings?.kunyomi?.join(' ') || undefined,
          };
        } else {
          const info = await lookupWordFlexible(display);
          const meaning = info?.meaning?.[0];
          additions[key] = {
            meaning: meaning ?? undefined,
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

  const loadPhotosForDetail = useCallback(async (d: { type: ItemType; id: string; wordAliases?: string[] }): Promise<PhotoEntry[]> => {
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

        // Load words spotted that contain this kanji
        const wordEntries = await getWordsContainingKanji(id, 60);
        setDetailWordsSpotted(wordEntries);
        setDetailLoading(false);
        return;
      }

      if (type === 'word') {
        const w = await lookupWordFlexible(id);
        setDetailWordInfo(w ? { reading: w.reading, meaning: w.meaning } : null);
        // Precompute kanji list for modal (unique, in-order)
        const uniq: string[] = [];
        for (const ch of id) {
          if (!isKanji(ch)) continue;
          if (!uniq.includes(ch)) uniq.push(ch);
        }
        setWordKanjiModal({ visible: false, kanji: uniq });
      }

      setDetailLoading(false);
    });
  }, [loadPhotosForDetail, runWithUiBusy]);

  // Ensure we have dictionary metadata for the "words spotted" list (for inline meaning/search).
  useEffect(() => {
    const missing = detailWordsSpotted
      .map((w) => `word:${w.word}`)
      .filter((k) => !metaCache[k]);
    if (!missing.length) return;

    let cancelled = false;
    (async () => {
      const additions: Record<string, { meaning?: string; reading?: string }> = {};
      for (const key of missing.slice(0, 120)) {
        if (cancelled) return;
        const word = key.slice('word:'.length);
        const info = await lookupWordFlexible(word);
        additions[key] = {
          meaning: info?.meaning?.[0],
          reading: info?.reading || undefined,
        };
        // yield occasionally
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

  const processCapturedUri = useCallback(async (sourceUri: string, photoType: 'encounter' | 'practice') => {
    setProcessing(true);
    setProcessingStatus('Processing 1/1…');
    try {
      const storedUri = await savePhotoToStorage(sourceUri);
      const ocrText = await processImage(storedUri, photoType === 'practice');
      const { kanji, words, kanjiCounts, wordCounts } = extractKanjiAndWordsWithCounts(ocrText);
      const photoId = await savePhoto(storedUri, photoType);
      // Persist counts (duplicates = occurrence counts)
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
    }
  }, [reloadList]);

  const processCapturedUris = useCallback(async (sourceUris: string[], photoType: 'encounter' | 'practice') => {
    if (!sourceUris.length) return;
    setProcessing(true);
    try {
      let totalKanji = 0;
      let totalWords = 0;
      for (let i = 0; i < sourceUris.length; i++) {
        setProcessingStatus(`Processing ${i + 1}/${sourceUris.length}…`);
        const storedUri = await savePhotoToStorage(sourceUris[i]);
        const ocrText = await processImage(storedUri, photoType === 'practice');
        const { kanji, words, kanjiCounts, wordCounts } = extractKanjiAndWordsWithCounts(ocrText);
        const photoId = await savePhoto(storedUri, photoType);
        if (Object.keys(kanjiCounts).length) await setPhotoKanjiCounts(photoId, photoType, kanjiCounts);
        if (Object.keys(wordCounts).length) await setPhotoWordCounts(photoId, photoType, wordCounts);
        totalKanji += kanji.length;
        totalWords += words.length;
      }
      await reloadList();
      Alert.alert('Saved', `Imported ${sourceUris.length} photos. Extracted ${totalKanji} kanji and ${totalWords} words total.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to process one of the selected photos.');
    } finally {
      setProcessing(false);
      setProcessingStatus('Processing…');
    }
  }, [reloadList]);

  const captureFromCamera = useCallback(async (photoType: 'encounter' | 'practice') => {
    const ok = await requestCameraPerms();
    if (!ok) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) return;
    await processCapturedUri(result.assets[0].uri, photoType);
  }, [processCapturedUri, requestCameraPerms]);

  const pickFromGallery = useCallback(async (photoType: 'encounter' | 'practice') => {
    const ok = await requestMediaPerms();
    if (!ok) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 0,
      quality: 0.8,
    });
    if (result.canceled) return;
    const uris = result.assets.map(a => a.uri).filter(Boolean);
    if (uris.length <= 1) {
      await processCapturedUri(uris[0], photoType);
    } else {
      await processCapturedUris(uris, photoType);
    }
  }, [processCapturedUri, processCapturedUris, requestMediaPerms]);

  const openGallery = useCallback(async () => {
    await runWithUiBusy('Loading gallery…', async () => {
      await reloadGallery();
      setScreen('gallery');
    });
  }, [reloadGallery]);

  const openFullImage = useCallback(async (photo: PhotoEntry) => {
    setFullImagePhoto(photo);
    setFullImageMenuVisible(false);
    // Load extracted meta in the background
    const kanji = await getKanjiForPhoto(photo.id);
    const words = await getWordsForPhoto(photo.id);
    setFullImageMeta({ kanji, words });
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

    // Kanji: each character (duplicates allowed)
    const kanjiCounts: Record<string, number> = {};
    for (const ch of editModal.kanjiText) {
      if (!isKanji(ch)) continue;
      kanjiCounts[ch] = (kanjiCounts[ch] ?? 0) + 1;
    }

    // Words: split by 、 or newline or spaces
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

  const onDeletePhoto = useCallback(async (photo: PhotoEntry) => {
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

  const Header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.dispatch(DrawerActions.openDrawer())} activeOpacity={0.85} accessibilityLabel="Menu">
        <Text style={styles.headerBtnText}>☰</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Nihongo Tracker</Text>
      <View style={styles.headerButtons}>
        {screen !== 'list' && (
          <TouchableOpacity style={styles.headerBtn} onPress={() => setScreen('list')}>
            <Text style={styles.headerBtnText}>List</Text>
          </TouchableOpacity>
        )}
        {screen !== 'gallery' && (
          <TouchableOpacity style={styles.headerBtn} onPress={openGallery}>
            <Text style={styles.headerBtnText}>Gallery</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {Header}


      <Modal visible={uiBusy} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.uiBusyOverlay}>
          <View style={styles.uiBusyCard}>
            <ActivityIndicator size="large" color="#e8e8e8" />
            <Text style={styles.uiBusyText}>{uiBusyLabel}</Text>
          </View>
        </View>
      </Modal>

      {processing && (
        <View style={styles.processingBar}>
          <Text style={styles.processingText}>{processingStatus}</Text>
        </View>
      )}

      {screen === 'settings' && (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: Math.max(24, insets.bottom + 12) }}>
          <Text style={styles.settingsTitle}>Settings</Text>

          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Hidden items</Text>

            <Text style={styles.settingsSubTitle}>Kanji</Text>
            {hiddenKanjiItems.length === 0 ? (
              <Text style={styles.mutedSmallCenter}>No hidden kanji.</Text>
            ) : (
              hiddenKanjiItems.map((k) => (
                <View key={`hk:${k.character}`} style={styles.hiddenRow}>
                  <Text style={styles.hiddenMain}>{k.character}</Text>
                  <TouchableOpacity
                    style={styles.hiddenX}
                    onPress={async () => {
                      await unhideKanji(k.character);
                      await loadHiddenItems();
                      await reloadList();
                    }}
                    activeOpacity={0.8}
                    accessibilityLabel={`Unhide ${k.character}`}
                  >
                    <Text style={styles.hiddenXText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            <Text style={[styles.settingsSubTitle, { marginTop: 14 }]}>Words</Text>
            {hiddenWordGroups.length === 0 ? (
              <Text style={styles.mutedSmallCenter}>No hidden words.</Text>
            ) : (
              hiddenWordGroups.map((w) => (
                <View key={`hw:${w.display}`} style={styles.hiddenRow}>
                  <Text style={styles.hiddenMain} numberOfLines={1} ellipsizeMode="tail">
                    {w.display}
                  </Text>
                  <TouchableOpacity
                    style={styles.hiddenX}
                    onPress={async () => {
                      await Promise.all(w.aliases.map((a) => unhideWord(a)));
                      await loadHiddenItems();
                      await reloadList();
                    }}
                    activeOpacity={0.8}
                    accessibilityLabel={`Unhide ${w.display}`}
                  >
                    <Text style={styles.hiddenXText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {screen === 'list' && (
        <>
          <View style={styles.controls}>
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder="Search…"
                placeholderTextColor="#8b93a7"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {!!searchQuery.trim() && (
                <TouchableOpacity
                  style={styles.searchClearBtn}
                  onPress={() => {
                    setSearchQuery('');
                    try {
                      searchInputRef.current?.focus?.();
                    } catch {}
                  }}
                  activeOpacity={0.8}
                  accessibilityLabel="Clear search"
                >
                  <Text style={styles.searchClearText}>×</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.tabRow}>
              <View style={styles.tabPill}>
                <TouchableOpacity
                  style={[styles.tabBtn, filterType === 'kanji' && styles.tabBtnActive]}
                  onPress={() => {
                    setFilterTypeAndPersist('kanji');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.tabText, filterType === 'kanji' && styles.tabTextActive]}>Kanji</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, filterType === 'word' && styles.tabBtnActive]}
                  onPress={() => {
                    setFilterTypeAndPersist('word');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.tabText, filterType === 'word' && styles.tabTextActive]}>Words</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sortBox}>
                <Dropdown
                  label="Sort"
                  valueLabel={`${sortMethod === 'gap' ? 'Score' : sortMethod === 'encountered' ? 'Seen' : 'Practiced'} ${sortDir === 'desc' ? '▼' : '▲'}`}
                  options={[
                    { key: 'gap', label: 'Score' },
                    { key: 'encountered', label: 'Seen' },
                    { key: 'practiced', label: 'Practiced' },
                  ]}
                  onSelect={(key) => {
                    const next = key as SortMethod;
                    if (next === sortMethod) {
                      const flipped: SortDir = sortDir === 'desc' ? 'asc' : 'desc';
                      setSortDir(flipped);
                      setPreference('sortDir', flipped);
                    } else {
                      setSortMethod(next);
                      setPreference('sortMethod', next);
                      setSortDir('desc');
                      setPreference('sortDir', 'desc');
                    }
                  }}
                />
              </View>
            </View>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#e94560" />
            </View>
          ) : normalizedQuery ? (
            <FlatList
              data={combinedSearchResults}
              keyExtractor={(it) => it.key}
              contentContainerStyle={{ paddingBottom: 96 }}
              renderItem={({ item, index }) => {
                const warn = item.encounter_count > 0 && item.practice_count === 0;
                const meta = metaCache[`${item.type}:${item.display}`];
                const gloss = meta?.meaning ?? '';
                return (
                  <TouchableOpacity
                    style={[styles.row, warn && styles.rowWarn]}
                    onPress={() => openDetail(item.type, item.display, (item as any).wordAliases)}
                    onLongPress={() => {
                      Alert.alert('Hide item', `Hide ${item.display}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Hide',
                          style: 'destructive',
                          onPress: async () => {
                            if (item.type === 'kanji') {
                              await hideKanji(item.display);
                            } else {
                              const aliases = (item as any).wordAliases?.length ? (item as any).wordAliases : [item.display];
                              await Promise.all(aliases.map((w: string) => hideWord(w)));
                            }
                            await reloadList();
                          },
                        },
                      ]);
                    }}
                  >
                    <Text style={styles.rank}>{index + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemText} numberOfLines={1} ellipsizeMode="tail">
                        {item.display}
                        {gloss ? <Text style={styles.itemGloss}> — {gloss}</Text> : null}
                      </Text>
                    </View>
                    <View style={styles.counts}>
                      <Text style={styles.countLabel}>Seen</Text>
                      <Text style={styles.countVal}>{item.encounter_count}</Text>
                    </View>
                    <View style={styles.counts}>
                      <Text style={styles.countLabel}>Practiced</Text>
                      <Text style={[styles.countVal, warn && styles.warnText]}>{item.practice_count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.muted}>No results found.</Text>
                </View>
              }
            />
          ) : (
            <View
              style={{ flex: 1 }}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w && w !== listWidth) setListWidth(w);
              }}
              {...swipeResponder.panHandlers}
            >
              <Animated.View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  width: listWidth * 2,
                  transform: [{ translateX: listTranslateX }],
                }}
              >
                <View style={{ width: listWidth, flex: 1 }}>
                  <FlatList
                    data={filteredSortedByType.kanji}
                    keyExtractor={(it) => it.key}
                    contentContainerStyle={{ paddingBottom: 96 }}
                    renderItem={({ item, index }) => {
                      const warn = item.encounter_count > 0 && item.practice_count === 0;
                      const meta = metaCache[`${item.type}:${item.display}`];
                      const gloss = meta?.meaning ?? '';
                      return (
                        <TouchableOpacity
                          style={[styles.row, warn && styles.rowWarn]}
                          onPress={() => openDetail(item.type, item.display)}
                          onLongPress={() => {
                            Alert.alert('Hide item', `Hide ${item.display}?`, [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Hide',
                                style: 'destructive',
                                onPress: async () => {
                                  await hideKanji(item.display);
                                  await reloadList();
                                },
                              },
                            ]);
                          }}
                        >
                          <Text style={styles.rank}>{index + 1}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemText} numberOfLines={1} ellipsizeMode="tail">
                              {item.display}
                              {gloss ? <Text style={styles.itemGloss}> — {gloss}</Text> : null}
                            </Text>
                          </View>
                          <View style={styles.counts}>
                            <Text style={styles.countLabel}>Seen</Text>
                            <Text style={styles.countVal}>{item.encounter_count}</Text>
                          </View>
                          <View style={styles.counts}>
                            <Text style={styles.countLabel}>Practiced</Text>
                            <Text style={[styles.countVal, warn && styles.warnText]}>{item.practice_count}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={
                      <View style={styles.center}>
                        <Text style={styles.muted}>No data yet. Add an encounter or practice photo.</Text>
                      </View>
                    }
                  />
                </View>

                <View style={{ width: listWidth, flex: 1 }}>
                  <FlatList
                    data={filteredSortedByType.word}
                    keyExtractor={(it) => it.key}
                    contentContainerStyle={{ paddingBottom: 96 }}
                    renderItem={({ item, index }) => {
                      const warn = item.encounter_count > 0 && item.practice_count === 0;
                      const meta = metaCache[`${item.type}:${item.display}`];
                      const gloss = meta?.meaning ?? '';
                      return (
                        <TouchableOpacity
                          style={[styles.row, warn && styles.rowWarn]}
                          onPress={() => openDetail(item.type, item.display, (item as any).wordAliases)}
                          onLongPress={() => {
                            Alert.alert('Hide item', `Hide ${item.display}?`, [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Hide',
                                style: 'destructive',
                                onPress: async () => {
                                  const aliases = (item as any).wordAliases?.length ? (item as any).wordAliases : [item.display];
                                  await Promise.all(aliases.map((w: string) => hideWord(w)));
                                  await reloadList();
                                },
                              },
                            ]);
                          }}
                        >
                          <Text style={styles.rank}>{index + 1}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemText} numberOfLines={1} ellipsizeMode="tail">
                              {item.display}
                              {gloss ? <Text style={styles.itemGloss}> — {gloss}</Text> : null}
                            </Text>
                          </View>
                          <View style={styles.counts}>
                            <Text style={styles.countLabel}>Seen</Text>
                            <Text style={styles.countVal}>{item.encounter_count}</Text>
                          </View>
                          <View style={styles.counts}>
                            <Text style={styles.countLabel}>Practiced</Text>
                            <Text style={[styles.countVal, warn && styles.warnText]}>{item.practice_count}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={
                      <View style={styles.center}>
                        <Text style={styles.muted}>No data yet. Add an encounter or practice photo.</Text>
                      </View>
                    }
                  />
                </View>
              </Animated.View>
            </View>
          )}

          <View style={[styles.bottomBar, { paddingBottom: Math.max(12, insets.bottom) }]}>
            <TouchableOpacity style={[styles.bottomBtn, styles.encBtn]} onPress={() => setCaptureModal({ visible: true, photoType: 'encounter' })}>
              <Text style={styles.bottomBtnText}>New Encounter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bottomBtn, styles.pracBtn]} onPress={() => setCaptureModal({ visible: true, photoType: 'practice' })}>
              <Text style={styles.bottomBtnText}>Add Practice</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {screen === 'detail' && detail && (
        <View style={{ flex: 1 }}>
          <View style={styles.detailHeader}>
            {detail.type === 'word' ? (
              <TouchableOpacity onPress={() => setWordKanjiModal((s) => ({ ...s, visible: true }))} activeOpacity={0.8}>
                <Text style={styles.detailTitle}>{detail.id}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.detailTitle}>{detail.id}</Text>
            )}

            {detail.type === 'kanji' && detailKanjiInfo && (
              <View style={styles.detailInfoCard}>
                {detailKanjiInfo.meanings.length > 0 && (
                  <View style={styles.detailInfoRow}>
                    <Text style={styles.detailInfoLabel}>Meaning</Text>
                    <Text style={styles.detailInfoValue}>{detailKanjiInfo.meanings.join(', ')}</Text>
                  </View>
                )}
                {detailKanjiInfo.readings.onyomi.length > 0 && (
                  <View style={styles.detailInfoRow}>
                    <Text style={styles.detailInfoLabel}>On’yomi</Text>
                    <View style={styles.readingsWrap}>
                      {uniqueReadings(detailKanjiInfo.readings.onyomi).map((r, idx) => (
                        <TouchableOpacity key={`on-${idx}-${r}`} style={styles.readingPill} onPress={() => speakJa(r)} activeOpacity={0.8}>
                          <Text style={styles.readingPillText}>{r}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                {detailKanjiInfo.readings.kunyomi.length > 0 && (
                  <View style={styles.detailInfoRow}>
                    <Text style={styles.detailInfoLabel}>Kun’yomi</Text>
                    <View style={styles.readingsWrap}>
                      {uniqueReadings(detailKanjiInfo.readings.kunyomi).map((r, idx) => (
                        <TouchableOpacity key={`kun-${idx}-${r}`} style={styles.readingPill} onPress={() => speakJa(r)} activeOpacity={0.8}>
                          <Text style={styles.readingPillText}>{r}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {detail.type === 'kanji' && detailWordsSpotted.length > 0 && (
              <View style={styles.detailInfoCard}>
                <Text style={styles.detailInfoLabel}>Words spotted</Text>
                <View style={{ marginTop: 10 }}>
                  {detailWordsSpotted.slice(0, 25).map((w) => {
                    const meta = metaCache[`word:${w.word}`];
                    const gloss = meta?.meaning ?? '';
                    return (
                      <TouchableOpacity
                        key={w.word}
                        style={styles.spottedRow}
                        onPress={() => openDetail('word', w.word)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.spottedMain} numberOfLines={1} ellipsizeMode="tail">
                          {w.word}
                          {gloss ? <Text style={styles.spottedGloss}> — {gloss}</Text> : null}
                        </Text>
                        <View style={styles.spottedCounts}>
                          <Text style={styles.spottedCountLabel}>Seen</Text>
                          <Text style={styles.spottedCountVal}>{w.encounter_count}</Text>
                        </View>
                        <View style={styles.spottedCounts}>
                          <Text style={styles.spottedCountLabel}>Practiced</Text>
                          <Text style={styles.spottedCountVal}>{w.practice_count}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {detail.type === 'word' && detailWordInfo && (
              <View style={styles.detailInfoCard}>
                {detailWordInfo.meaning.length > 0 && (
                  <View style={styles.detailInfoRow}>
                    <Text style={styles.detailInfoLabel}>Meaning</Text>
                    <Text style={styles.detailInfoValue}>{detailWordInfo.meaning.join(', ')}</Text>
                  </View>
                )}
                {!!detailWordInfo.reading && (
                  <View style={styles.detailInfoRow}>
                    <Text style={styles.detailInfoLabel}>Reading</Text>
                    <TouchableOpacity style={styles.readingPill} onPress={() => speakJa(detailWordInfo.reading)} activeOpacity={0.8}>
                      <Text style={styles.readingPillText}>{detailWordInfo.reading}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            <View style={styles.detailStatsRow}>
              <View style={styles.detailStatPill}>
                <Text style={styles.detailStatNum}>{detailPhotos.filter((p) => p.type === 'encounter').length}</Text>
                <Text style={styles.detailStatLabel}>Encounter photos</Text>
              </View>
              <View style={styles.detailStatPill}>
                <Text style={styles.detailStatNum}>{detailPhotos.filter((p) => p.type === 'practice').length}</Text>
                <Text style={styles.detailStatLabel}>Practice photos</Text>
              </View>
            </View>
          </View>

          {detailPhotos.length === 0 ? (
            <View style={styles.center}>
              {detailLoading ? (
                <ActivityIndicator size="large" color="#e94560" />
              ) : (
                <Text style={styles.muted}>No photos found.</Text>
              )}
            </View>
          ) : (
            <FlatList
              data={detailPhotos}
              keyExtractor={(p) => String(p.id)}
              numColumns={3}
              contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.thumbWrap} onPress={() => openFullImage(item)} onLongPress={() => onDeletePhoto(item)}>
                  <Image source={{ uri: item.uri }} style={styles.thumb} />
                </TouchableOpacity>
              )}
            />
          )}

          <Text style={styles.mutedSmallCenter}>Long-press a thumbnail to delete the photo.</Text>
        </View>
      )}

      {/* Word -> Kanji list modal */}
      <Modal visible={wordKanjiModal.visible} transparent animationType="fade" onRequestClose={() => setWordKanjiModal((s) => ({ ...s, visible: false }))}>
        <TouchableOpacity style={styles.uiBusyOverlay} activeOpacity={1} onPress={() => setWordKanjiModal((s) => ({ ...s, visible: false }))}>
          <View style={styles.kanjiListCard}>
            <Text style={styles.modalTitle}>Kanji in this word</Text>
            {wordKanjiModal.kanji.length === 0 ? (
              <Text style={styles.mutedSmall}>No kanji found.</Text>
            ) : (
              wordKanjiModal.kanji.map((k) => {
                const meta = metaCache[`kanji:${k}`];
                const gloss = meta?.meaning ?? '';
                return (
                  <TouchableOpacity
                    key={k}
                    style={styles.spottedRow}
                    onPress={() => {
                      setWordKanjiModal((s) => ({ ...s, visible: false }));
                      openDetail('kanji', k);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.spottedMain} numberOfLines={1} ellipsizeMode="tail">
                      {k}
                      {gloss ? <Text style={styles.spottedGloss}> — {gloss}</Text> : null}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {screen === 'gallery' && (
        <View style={{ flex: 1 }}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>Gallery</Text>
            <Text style={styles.mutedSmall}>Tap to view. Long-press to delete.</Text>
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <View style={styles.tabPill}>
                <TouchableOpacity
                  style={[styles.tabBtn, galleryType === 'encounter' && styles.tabBtnActive]}
                  onPress={() => {
                    setGalleryType('encounter');
                    setPreference('galleryType', 'encounter');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.tabText, galleryType === 'encounter' && styles.tabTextActive]}>Encounters</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, galleryType === 'practice' && styles.tabBtnActive]}
                  onPress={() => {
                    setGalleryType('practice');
                    setPreference('galleryType', 'practice');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.tabText, galleryType === 'practice' && styles.tabTextActive]}>Practice</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {galleryLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#e94560" />
            </View>
          ) : (
            <View
              style={{ flex: 1 }}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w && w !== galleryWidth) setGalleryWidth(w);
              }}
              {...gallerySwipeResponder.panHandlers}
            >
              <Animated.View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  width: galleryWidth * 2,
                  transform: [{ translateX: galleryTranslateX }],
                }}
              >
                <View style={{ width: galleryWidth, flex: 1 }}>
                  {allPhotos.filter((p) => p.type === 'encounter').length === 0 ? (
                    <View style={styles.center}>
                      <Text style={styles.muted}>No encounter photos yet.</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={allPhotos.filter((p) => p.type === 'encounter')}
                      keyExtractor={(p) => String(p.id)}
                      numColumns={3}
                      contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={styles.thumbWrap}
                          onPress={() => openFullImage(item)}
                          onLongPress={() => onDeletePhoto(item)}
                        >
                          <Image source={{ uri: item.uri }} style={styles.thumb} />
                        </TouchableOpacity>
                      )}
                    />
                  )}
                </View>

                <View style={{ width: galleryWidth, flex: 1 }}>
                  {allPhotos.filter((p) => p.type === 'practice').length === 0 ? (
                    <View style={styles.center}>
                      <Text style={styles.muted}>No practice photos yet.</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={allPhotos.filter((p) => p.type === 'practice')}
                      keyExtractor={(p) => String(p.id)}
                      numColumns={3}
                      contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={styles.thumbWrap}
                          onPress={() => openFullImage(item)}
                          onLongPress={() => onDeletePhoto(item)}
                        >
                          <Image source={{ uri: item.uri }} style={styles.thumb} />
                        </TouchableOpacity>
                      )}
                    />
                  )}
                </View>
              </Animated.View>
            </View>
          )}
        </View>
      )}

      {/* Full image viewer (tap toggles menu; back closes) */}
      <Modal visible={!!fullImagePhoto} transparent animationType="fade" onRequestClose={() => { setFullImageMenuVisible(false); setFullImagePhoto(null); setFullImageMeta(null); }}>
        <View style={styles.fullOverlay}>
          <TouchableOpacity
            style={styles.fullTapZone}
            activeOpacity={1}
            onPress={() => setFullImageMenuVisible(v => !v)}
          >
            {fullImagePhoto && <Image source={{ uri: fullImagePhoto.uri }} style={styles.fullImage} resizeMode="contain" />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.fullClose}
            onPress={() => { setFullImageMenuVisible(false); setFullImagePhoto(null); setFullImageMeta(null); }}
          >
            <Text style={styles.fullCloseText}>✕</Text>
          </TouchableOpacity>

          {fullImageMenuVisible && fullImagePhoto && (
            <View style={styles.fullMenu}>
              <Text style={styles.fullMenuTitle}>{fullImagePhoto.type === 'encounter' ? 'Encounter' : 'Practice'}</Text>
              <Text style={styles.mutedSmall}>
                Kanji: {fullImageMeta?.kanji?.length ? fullImageMeta.kanji.join(' ') : 'None'}
              </Text>
              <Text style={styles.mutedSmall}>
                Words: {fullImageMeta?.words?.length ? fullImageMeta.words.join('、 ') : 'None'}
              </Text>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={async () => {
                  const p = fullImagePhoto;
                  setFullImageMenuVisible(false);
                  setFullImagePhoto(null);
                  setFullImageMeta(null);
                  await openEditForPhoto(p);
                }}
              >
                <Text style={styles.modalBtnText}>Edit Extracted Text</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalDanger]} onPress={() => onDeletePhoto(fullImagePhoto)}>
                <Text style={styles.modalBtnText}>Delete Photo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Edit extracted text modal */}
      <Modal visible={editModal.visible} transparent animationType="slide" onRequestClose={() => setEditModal({ visible: false, photo: null, kanjiText: '', wordsText: '' })}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Extracted Text</Text>
            <Text style={styles.mutedSmall}>Kanji (characters, duplicates allowed):</Text>
            <TextInput
              style={styles.search}
              placeholder="e.g. 公園禁止"
              placeholderTextColor="#666"
              value={editModal.kanjiText}
              onChangeText={(t) => setEditModal((s) => ({ ...s, kanjiText: t }))}
            />
            <Text style={styles.mutedSmall}>Words (separate with 、 or spaces):</Text>
            <TextInput
              style={styles.search}
              placeholder="e.g. 立入禁止、公園"
              placeholderTextColor="#666"
              value={editModal.wordsText}
              onChangeText={(t) => setEditModal((s) => ({ ...s, wordsText: t }))}
            />
            <TouchableOpacity style={styles.modalBtn} onPress={saveEditForPhoto}>
              <Text style={styles.modalBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={() => setEditModal({ visible: false, photo: null, kanjiText: '', wordsText: '' })}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={captureModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setCaptureModal({ visible: false, photoType: null })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {captureModal.photoType === 'encounter' ? 'New Encounter' : 'Add Practice'}
            </Text>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={async () => {
                const t = captureModal.photoType;
                setCaptureModal({ visible: false, photoType: null });
                if (!t) return;
                await captureFromCamera(t);
              }}
            >
              <Text style={styles.modalBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={async () => {
                const t = captureModal.photoType;
                setCaptureModal({ visible: false, photoType: null });
                if (!t) return;
                await pickFromGallery(t);
              }}
            >
              <Text style={styles.modalBtnText}>Choose from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={() => setCaptureModal({ visible: false, photoType: null })}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AppInner() {
  const setScreenRef = useRef<((s: Screen) => void) | null>(null);

  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: '#0f0f1a',
          width: 280,
        },
        drawerPosition: 'left',
        swipeEnabled: true,
      }}
      drawerContent={(props) => (
        <CustomDrawerContent
          {...props}
          onOpenSettings={() => {
            if (setScreenRef.current) {
              setScreenRef.current('settings');
            }
          }}
        />
      )}
    >
      <Drawer.Screen name="Main">
        {() => <MainScreen onOpenSettings={(setScreen) => { setScreenRef.current = setScreen; }} />}
      </Drawer.Screen>
    </Drawer.Navigator>
  );
}

function Dropdown({
  label,
  valueLabel,
  options,
  onSelect,
}: {
  label: string;
  valueLabel: string;
  options: { key: string; label: string }[];
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const btnRef = useRef<any>(null);

  const close = useCallback(() => setOpen(false), []);
  const openMenu = useCallback(() => {
    const node: any = btnRef.current;
    if (!node?.measureInWindow) {
      setAnchor(null);
      setOpen(true);
      return;
    }
    node.measureInWindow((x: number, y: number, width: number, height: number) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }, []);

  const window = Dimensions.get('window');
  const menuWidth = Math.max(160, anchor?.width ?? 160);
  const left = anchor ? Math.max(12, Math.min(anchor.x, window.width - menuWidth - 12)) : 12;
  const belowTop = anchor ? anchor.y + anchor.height + 6 : 12;
  const aboveTop = anchor ? Math.max(12, anchor.y - 6) : 12;
  const spaceBelow = window.height - belowTop - 12;
  const spaceAbove = anchor ? anchor.y - 12 : 0;
  const preferBelow = spaceBelow >= 140 || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(120, Math.min(320, preferBelow ? spaceBelow : spaceAbove));
  const top = preferBelow ? belowTop : Math.max(12, aboveTop - maxHeight);

  return (
    <>
      <TouchableOpacity ref={btnRef} style={styles.dropdown} onPress={openMenu} activeOpacity={0.85}>
        <Text style={styles.dropdownLabel}>{label}</Text>
        <Text style={styles.dropdownValue}>{valueLabel}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={close}>
          <View
            style={[styles.dropdownMenu, { left, top, width: menuWidth, maxHeight }]}
            onStartShouldSetResponder={() => true}
          >
            <ScrollView>
              {options.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={styles.dropdownOption}
                  onPress={() => {
                    close();
                    onSelect(o.key);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.dropdownOptionText}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  header: { padding: 12, backgroundColor: '#1a1a2e', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flex: 1, color: '#e8e8e8', fontSize: 18, fontWeight: '700', letterSpacing: 0.2, marginLeft: 12 },
  headerButtons: { flexDirection: 'row', gap: 8 },
  headerBtn: { backgroundColor: '#16213e', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  headerBtnText: { color: '#e8e8e8', fontSize: 13, fontWeight: '600' },
  drawerHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#16213e' },
  drawerTitle: { color: '#e8e8e8', fontSize: 20, fontWeight: '800' },
  drawerItem: { marginHorizontal: 8, marginVertical: 4, borderRadius: 8 },
  drawerItemLabel: { color: '#e8e8e8', fontSize: 16, fontWeight: '600' },
  processingBar: { paddingVertical: 8, backgroundColor: 'rgba(233, 69, 96, 0.15)' },
  processingText: { textAlign: 'center', color: '#e94560', fontWeight: '600' },
  uiBusyOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  uiBusyCard: { width: '100%', maxWidth: 320, backgroundColor: '#1a1a2e', borderRadius: 16, paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#16213e' },
  uiBusyText: { color: '#e8e8e8', fontSize: 14, fontWeight: '700' },

  controls: { padding: 12, backgroundColor: '#1a1a2e', borderBottomWidth: 1, borderBottomColor: '#16213e', gap: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#24314e', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(232,232,232,0.08)' },
  searchIcon: { marginRight: 8, color: '#8b93a7', fontSize: 16 },
  searchInput: { flex: 1, color: '#e8e8e8', fontSize: 16, fontWeight: '600' },
  searchClearBtn: { marginLeft: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(22,33,62,0.9)', alignItems: 'center', justifyContent: 'center' },
  searchClearText: { color: '#e8e8e8', fontSize: 20, fontWeight: '800', marginTop: -1 },
  search: { backgroundColor: '#16213e', borderRadius: 10, padding: 12, color: '#e8e8e8' },
  dropdownRow: { flexDirection: 'row', gap: 10 },
  dropdown: { flex: 1, backgroundColor: '#16213e', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 4 },
  dropdownLabel: { color: '#a0a0a0', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  dropdownValue: { color: '#e8e8e8', fontSize: 14, fontWeight: '700' },
  dropdownOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  dropdownMenu: {
    position: 'absolute',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22314f',
    overflow: 'hidden',
  },
  dropdownOption: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(232,232,232,0.06)' },
  dropdownOptionText: { color: '#e8e8e8', fontWeight: '800' },
  tabRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tabPill: { flexDirection: 'row', backgroundColor: '#16213e', borderRadius: 999, padding: 4, borderWidth: 1, borderColor: '#22314f' },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  tabBtnActive: { backgroundColor: '#24314e' },
  tabText: { color: '#a0a0a0', fontSize: 13, fontWeight: '800' },
  tabTextActive: { color: '#e8e8e8' },
  sortBox: { width: 150 },

  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a2e', marginHorizontal: 12, marginVertical: 5, padding: 14, borderRadius: 14 },
  rowWarn: { borderLeftWidth: 4, borderLeftColor: '#e94560' },
  rank: { width: 28, textAlign: 'center', color: '#666', fontWeight: '600' },
  itemText: { flex: 1, color: '#e8e8e8', fontSize: 20, fontWeight: '600' },
  itemGloss: { color: '#a0a0a0', fontSize: 14, fontWeight: '600' },
  counts: { width: 76, alignItems: 'center' },
  countLabel: { color: '#666', fontSize: 11, textTransform: 'uppercase' },
  countVal: { color: '#e8e8e8', fontSize: 16, fontWeight: '700' },
  warnText: { color: '#e94560' },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#1a1a2e', padding: 12, flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: '#16213e' },
  bottomBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  encBtn: { backgroundColor: '#22c55e' },
  pracBtn: { backgroundColor: '#60a5fa' },
  bottomBtnText: { color: '#0b1020', fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: '#666', textAlign: 'center' },
  mutedSmall: { color: '#666', fontSize: 12 },
  mutedSmallCenter: { color: '#666', fontSize: 12, textAlign: 'center', paddingBottom: 10 },

  settingsTitle: { color: '#e8e8e8', fontSize: 22, fontWeight: '900', marginBottom: 12 },
  settingsSection: { backgroundColor: '#1a1a2e', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#16213e' },
  settingsSectionTitle: { color: '#e8e8e8', fontSize: 14, fontWeight: '900', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  settingsSubTitle: { color: '#a0a0a0', fontSize: 12, fontWeight: '900', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  hiddenRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#16213e', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  hiddenMain: { flex: 1, color: '#e8e8e8', fontSize: 18, fontWeight: '800' },
  hiddenX: { marginLeft: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(233, 69, 96, 0.25)', alignItems: 'center', justifyContent: 'center' },
  hiddenXText: { color: '#e8e8e8', fontSize: 20, fontWeight: '900', marginTop: -1 },

  detailHeader: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#16213e' },
  detailTitle: { color: '#e8e8e8', fontSize: 36, fontWeight: '800' },
  detailSubtitle: { color: '#a0a0a0', fontSize: 14, fontWeight: '700', marginTop: 2 },
  detailInfoCard: { marginTop: 12, backgroundColor: '#16213e', borderRadius: 14, padding: 12, gap: 10 },
  detailInfoRow: { gap: 4 },
  detailInfoLabel: { color: '#a0a0a0', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  detailInfoValue: { color: '#e8e8e8', fontSize: 16, fontWeight: '600', lineHeight: 22 },
  readingsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  readingPill: { alignSelf: 'flex-start', backgroundColor: '#1a1a2e', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#22314f' },
  readingPillText: { color: '#e8e8e8', fontSize: 16, fontWeight: '800' },
  detailStatsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  detailStatPill: { flex: 1, backgroundColor: '#16213e', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  detailStatNum: { color: '#e8e8e8', fontSize: 22, fontWeight: '800' },
  detailStatLabel: { color: '#a0a0a0', fontSize: 12, marginTop: 2, fontWeight: '600' },
  spottedRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a2e', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1e2b44' },
  spottedMain: { flex: 1, color: '#e8e8e8', fontSize: 18, fontWeight: '700' },
  spottedGloss: { color: '#a0a0a0', fontSize: 13, fontWeight: '600' },
  spottedCounts: { width: 72, alignItems: 'center' },
  spottedCountLabel: { color: '#666', fontSize: 10, textTransform: 'uppercase' },
  spottedCountVal: { color: '#e8e8e8', fontSize: 14, fontWeight: '800' },
  kanjiListCard: { width: '100%', maxWidth: 420, backgroundColor: '#1a1a2e', borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: '#16213e' },

  thumbWrap: { width: '33.33%', padding: 6 },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#16213e' },

  fullOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  fullTapZone: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '80%' },
  fullClose: { position: 'absolute', top: 18, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(22,33,62,0.9)', alignItems: 'center', justifyContent: 'center' },
  fullCloseText: { color: '#e8e8e8', fontSize: 18, fontWeight: '800' },
  fullMenu: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#1a1a2e', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: '#16213e' },
  fullMenuTitle: { color: '#e8e8e8', fontSize: 16, fontWeight: '800', textAlign: 'center' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalCard: { backgroundColor: '#1a1a2e', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 10 },
  modalTitle: { color: '#e8e8e8', fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  modalBtn: { backgroundColor: '#16213e', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalDanger: { backgroundColor: 'rgba(233, 69, 96, 0.25)' },
  modalCancel: { backgroundColor: 'rgba(233, 69, 96, 0.2)' },
  modalBtnText: { color: '#e8e8e8', fontWeight: '700' },
});





