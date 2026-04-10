import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Animated, TouchableWithoutFeedback, PanResponder, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ImageViewer from 'react-native-image-zoom-viewer';
import { toRomaji } from 'wanakana';
import { colors, styles } from '../../styles/theme';
import { PhotoEntry, FullImageMeta, MetaCacheEntry } from '../../types';
import { SegmentedToggle } from '../SegmentedToggle';
import { useSwipePager, useSpeech } from '../../hooks';
import { Ionicons } from '@expo/vector-icons';
import { generateContextExplanation } from '../../../services/contextExplanation';
import { loadContextCache, parseContextResponse, saveContextCacheEntry } from '../../../services/contextExplanationShared';
import { processImage } from '../../../services/ocr';
import { updatePhotoOcrText } from '../../../services/database';
import { tokenizeSentenceWords, lookupWordBatch, WordInfo } from '../../../services/dictionary';
import { analyzeImage } from '../../../services/imageAnalysis';
import { getPreference, setPreference } from '../../../utils/preferences';

const IMAGE_ANALYSIS_CACHE_KEY = 'imageAnalysisCache';

type ImageAnalysisCache = Record<string, string>;

async function loadImageAnalysisCache(): Promise<ImageAnalysisCache> {
  const raw = await getPreference(IMAGE_ANALYSIS_CACHE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ImageAnalysisCache;
  } catch {
    return {};
  }
}

async function saveImageAnalysisCacheEntry(photoId: number, text: string): Promise<void> {
  const cache = await loadImageAnalysisCache();
  cache[String(photoId)] = text;
  await setPreference(IMAGE_ANALYSIS_CACHE_KEY, JSON.stringify(cache));
}

interface FullImageModalProps {
  photo: PhotoEntry | null;
  photos: PhotoEntry[];
  imageIndex: number;
  meta: FullImageMeta | null;
  metaCache: Record<string, MetaCacheEntry>;
  menuVisible: boolean;
  reprocessBusy: boolean;
  menuTab: 'kanji' | 'word';
  onMenuTabChange: (t: 'kanji' | 'word') => void;
  scrollY: { kanji: number; word: number };
  onScrollYChange: React.Dispatch<React.SetStateAction<{ kanji: number; word: number }>>;
  onIndexChange: (index: number) => void | Promise<void>;
  onClose: () => void;
  onToggleMenu: () => void;
  onReprocess: () => void;
  onRetakeCamera: (photo: PhotoEntry) => void;
  onRetakeGallery: (photo: PhotoEntry) => void;
  onApplyEdits: (next: { kanji: string[]; words: string[] }) => void;
  onOpenKanji: (k: string) => void;
  onOpenWord: (w: string) => void;
  onDelete: () => void;
  geminiApiKey: string | null;
  setGeminiApiKey: (key: string) => Promise<void>;
  ocrApiKey: string | null;
  onOpenDetail: (type: 'kanji' | 'word', id: string) => void;
}

export function FullImageModal({
  photo,
  photos,
  imageIndex,
  meta,
  metaCache,
  menuVisible,
  reprocessBusy,
  menuTab,
  onMenuTabChange,
  scrollY,
  onScrollYChange,
  onIndexChange,
  onClose,
  onToggleMenu,
  onReprocess,
  onRetakeCamera,
  onRetakeGallery,
  onApplyEdits,
  onOpenKanji,
  onOpenWord,
  onDelete,
  geminiApiKey,
  setGeminiApiKey,
  ocrApiKey,
  onOpenDetail,
}: FullImageModalProps) {
  const insets = useSafeAreaInsets();
  const { speakJa } = useSpeech();
  const [editMode, setEditMode] = useState(false);
  const [draftKanji, setDraftKanji] = useState<string[]>([]);
  const [draftWords, setDraftWords] = useState<string[]>([]);
  const [retakeChoiceVisible, setRetakeChoiceVisible] = useState(false);
  const [overflowVisible, setOverflowVisible] = useState(false);

  const [contextModalVisible, setContextModalVisible] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextSentence, setContextSentence] = useState('');
  const [contextRomaji, setContextRomaji] = useState('');
  const [contextExplanation, setContextExplanation] = useState('');
  const [contextTarget, setContextTarget] = useState('');
  const [contextType, setContextType] = useState<'kanji' | 'word'>('word');
  const [contextError, setContextError] = useState('');
  const contextGeminiWordsRef = useRef<Array<{ word: string; reading: string }>>([]);

  const [contextWordsModal, setContextWordsModal] = useState<{ visible: boolean; words: WordInfo[] }>({ visible: false, words: [] });
  const [contextWordsBusy, setContextWordsBusy] = useState(false);

  const [tokenEditorVisible, setTokenEditorVisible] = useState(false);
  const [tokenKind, setTokenKind] = useState<'kanji' | 'word'>('kanji');
  const [tokenIndex, setTokenIndex] = useState(0);
  const [tokenValue, setTokenValue] = useState('');

  const [analysisModalVisible, setAnalysisModalVisible] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [analysisError, setAnalysisError] = useState('');

  const [geminiPromptVisible, setGeminiPromptVisible] = useState(false);
  const [geminiInput, setGeminiInput] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const pendingGeminiActionRef = useRef<{ type: 'context'; token: string; contextType: 'kanji' | 'word' } | { type: 'analysis' } | null>(null);

  const kanjiScrollRef = useRef<ScrollView | null>(null);
  const wordScrollRef = useRef<ScrollView | null>(null);

  // Track scroll positions in refs to avoid re-renders during scroll
  const kanjiScrollYRef = useRef(scrollY.kanji);
  const wordScrollYRef = useRef(scrollY.word);
  const kanjiContentHRef = useRef(0);
  const kanjiViewportHRef = useRef(0);
  const wordContentHRef = useRef(0);
  const wordViewportHRef = useRef(0);
  const lastPhotoIdRef = useRef<number | null>(null);
  const prevMenuVisibleRef = useRef(false);
  const prevMenuVisibleForRestoreRef = useRef(false);
  const lastRestoredRef = useRef<{ photoId: number | null; kanji: number; word: number }>({ photoId: null, kanji: 0, word: 0 });

  const clampScrollY = useCallback((kind: 'kanji' | 'word', y: number) => {
    const contentH = kind === 'kanji' ? kanjiContentHRef.current : wordContentHRef.current;
    const viewportH = kind === 'kanji' ? kanjiViewportHRef.current : wordViewportHRef.current;
    if (!Number.isFinite(y)) return 0;
    // If metrics are not available yet (initial mount), only clamp negative values.
    if (contentH <= 0 || viewportH <= 0) return Math.max(0, y);
    const maxY = Math.max(0, contentH - viewportH);
    return Math.max(0, Math.min(y, maxY));
  }, []);

  useEffect(() => {
    const prevMenuVisible = prevMenuVisibleRef.current;
    prevMenuVisibleRef.current = menuVisible;

    // If the menu just closed, persist the last known scroll positions.
    if (prevMenuVisible && !menuVisible) {
      onScrollYChange({ kanji: kanjiScrollYRef.current, word: wordScrollYRef.current });
    }
  }, [menuVisible, onScrollYChange]);

  useEffect(() => {
    // If the photo changes, hard reset scroll state for the menu (do not carry across photos).
    const nextId = photo?.id ?? null;
    const prevId = lastPhotoIdRef.current;
    lastPhotoIdRef.current = nextId;
    if (nextId && prevId && nextId !== prevId) {
      kanjiScrollYRef.current = 0;
      wordScrollYRef.current = 0;
      onScrollYChange({ kanji: 0, word: 0 });
    }

    // Reset edit state when photo changes or menu closes.
    setEditMode(false);
    setTokenEditorVisible(false);
    setRetakeChoiceVisible(false);
    setOverflowVisible(false);
    setTokenValue('');
  }, [photo?.id, menuVisible]);

  useEffect(() => {
    const wasVisible = prevMenuVisibleForRestoreRef.current;
    prevMenuVisibleForRestoreRef.current = menuVisible;
    if (!menuVisible) return;
    // Restore scroll positions on open (and after Back-restore), but avoid fighting live scrolling.
    const nextKanjiY = clampScrollY('kanji', scrollY.kanji);
    const nextWordY = clampScrollY('word', scrollY.word);

    const justOpened = !wasVisible && menuVisible;
    const photoId = photo?.id ?? null;
    const last = lastRestoredRef.current;
    const needsRestore =
      justOpened ||
      last.photoId !== photoId ||
      Math.abs(nextKanjiY - kanjiScrollYRef.current) > 2 ||
      Math.abs(nextWordY - wordScrollYRef.current) > 2;

    if (!needsRestore) return;

    lastRestoredRef.current = { photoId, kanji: nextKanjiY, word: nextWordY };
    kanjiScrollYRef.current = nextKanjiY;
    wordScrollYRef.current = nextWordY;

    requestAnimationFrame(() => {
      try {
        kanjiScrollRef.current?.scrollTo({ y: nextKanjiY, animated: false });
        wordScrollRef.current?.scrollTo({ y: nextWordY, animated: false });
      } catch {}
    });
  }, [clampScrollY, menuVisible, photo?.id, scrollY.kanji, scrollY.word]);

  useEffect(() => {
    if (!editMode) return;
    setDraftKanji(meta?.kanji ? [...meta.kanji] : []);
    setDraftWords(meta?.words ? [...meta.words] : []);
  }, [editMode, meta?.kanji, meta?.words]);

  const displayKanji = editMode ? draftKanji : meta?.kanji ?? [];
  const displayWords = editMode ? draftWords : meta?.words ?? [];

  const wordRows = useMemo(() => {
    return displayWords.map((w) => {
      const cached = metaCache[`word:${w}`];
      const gloss = cached?.meaning ?? '';
      const reading = cached?.reading?.trim() || '';
      const romaji = reading ? toRomaji(reading).trim() : '';
      return { w, gloss, romaji };
    });
  }, [displayWords, metaCache]);

  const kanjiRows = useMemo(() => {
    return displayKanji.map((k) => {
      const meaning = metaCache[`kanji:${k}`]?.meaning ?? '';
      return { k, meaning };
    });
  }, [displayKanji, metaCache]);

  const openTokenEditor = (kind: 'kanji' | 'word', index: number, value: string) => {
    setTokenKind(kind);
    setTokenIndex(index);
    setTokenValue(value);
    setTokenEditorVisible(true);
  };

  const applyTokenEdit = () => {
    const next = tokenValue.trim();
    if (tokenKind === 'kanji') {
      setDraftKanji((prev) => prev.map((v, i) => (i === tokenIndex ? next : v)).filter(Boolean));
    } else {
      setDraftWords((prev) => prev.map((v, i) => (i === tokenIndex ? next : v)).filter(Boolean));
    }
    setTokenEditorVisible(false);
    setTokenValue('');
  };

  const handleSaveEdits = () => {
    onApplyEdits({ kanji: draftKanji.filter(Boolean), words: draftWords.filter(Boolean) });
    setEditMode(false);
  };

  const handleSingleTap = useCallback(() => {
    onToggleMenu();
  }, [onToggleMenu]);

  const imageSources = useMemo(() => photos.map((p) => ({ url: p.uri })), [photos]);

  const handleIndexChanged = useCallback(
    (index?: number) => {
      if (typeof index !== 'number') return;
      if (index < 0 || index >= photos.length) return;
      onIndexChange(index);
    },
    [onIndexChange, photos]
  );

  const swipeUpResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !menuVisible && gestureState.dy < -16 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.5,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy < -20) {
            onToggleMenu();
          }
        },
      }),
    [menuVisible, onToggleMenu]
  );

  const handlePressKanjiRow = useCallback(
    (k: string) => {
      // Flush scroll refs into state so navigation snapshot is accurate.
      onScrollYChange({ kanji: kanjiScrollYRef.current, word: wordScrollYRef.current });
      onOpenKanji(k);
    },
    [onOpenKanji, onScrollYChange]
  );

  const handlePressWordRow = useCallback(
    (w: string) => {
      onScrollYChange({ kanji: kanjiScrollYRef.current, word: wordScrollYRef.current });
      onOpenWord(w);
    },
    [onOpenWord, onScrollYChange]
  );

  const ocrTextCacheRef = useRef<Record<number, string>>({});

  const handleContextQuery = useCallback(
    async (token: string, type: 'kanji' | 'word', forceRefresh = false, keyOverride?: string) => {
      if (!photo) return;
      const activeKey = keyOverride?.trim() || geminiApiKey || '';
      if (!activeKey) {
        pendingGeminiActionRef.current = { type: 'context', token, contextType: type };
        setGeminiPromptVisible(true);
        return;
      }

      setContextTarget(token);
      setContextType(type);
      setContextError('');
      setContextModalVisible(true);

      const cacheKey = `${photo.id}:${type}:${token}`;

      if (!forceRefresh) {
        try {
          const cache = await loadContextCache();
          const cached = cache[cacheKey];
          if (cached) {
            setContextSentence(cached.sentence);
            setContextRomaji(cached.romaji);
            setContextExplanation(cached.explanation);
            contextGeminiWordsRef.current = cached.words ?? [];
            setContextLoading(false);
            return;
          }
        } catch {}
      }

      setContextSentence('');
      setContextRomaji('');
      setContextExplanation('');
      setContextLoading(true);

      try {
        let ocrText = photo.ocr_text;
        if (!ocrText) {
          const ocrCached = ocrTextCacheRef.current[photo.id];
          if (ocrCached) {
            ocrText = ocrCached;
          } else {
            if (!ocrApiKey) {
              setContextError('No Cloud Vision API key configured. Cannot extract text for context.');
              setContextLoading(false);
              return;
            }
            const ocr = await processImage(photo.uri, ocrApiKey, false);
            ocrText = ocr.text;
            if (ocrText) {
              ocrTextCacheRef.current[photo.id] = ocrText;
              await updatePhotoOcrText(photo.id, ocrText).catch(() => {});
            }
          }
        }

        if (!ocrText) {
          setContextError('No text could be extracted from this image.');
          setContextLoading(false);
          return;
        }

        const result = await generateContextExplanation(activeKey, {
          type,
          text: token,
          fullOcrText: ocrText,
        });

        const parsed = parseContextResponse(result.content);
        await saveContextCacheEntry(cacheKey, parsed).catch(() => {});
        setContextSentence(parsed.sentence);
        setContextRomaji(parsed.romaji);
        setContextExplanation(parsed.explanation);
        contextGeminiWordsRef.current = parsed.words ?? [];
      } catch (err: any) {
        setContextError(err?.message || 'Failed to generate context explanation.');
      } finally {
        setContextLoading(false);
      }
    },
    [photo, geminiApiKey, ocrApiKey]
  );

  const handleImageAnalysis = useCallback(
    async (forceRefresh = false, keyOverride?: string) => {
      if (!photo) return;
      const activeKey = keyOverride?.trim() || geminiApiKey || '';
      if (!activeKey) {
        pendingGeminiActionRef.current = { type: 'analysis' };
        setGeminiPromptVisible(true);
        return;
      }

      setAnalysisError('');
      setAnalysisModalVisible(true);

      if (!forceRefresh) {
        try {
          const cache = await loadImageAnalysisCache();
          const cached = cache[String(photo.id)];
          if (cached) {
            setAnalysisText(cached);
            setAnalysisLoading(false);
            return;
          }
        } catch {}
      }

      setAnalysisText('');
      setAnalysisLoading(true);

      try {
        const result = await analyzeImage(activeKey, photo.uri);
        await saveImageAnalysisCacheEntry(photo.id, result).catch(() => {});
        setAnalysisText(result);
      } catch (err: any) {
        setAnalysisError(err?.message || 'Failed to analyze image.');
      } finally {
        setAnalysisLoading(false);
      }
    },
    [photo, geminiApiKey]
  );

  const saveGeminiKeyAndRetry = useCallback(async () => {
    const trimmed = geminiInput.trim();
    if (!trimmed) return;
    await setGeminiApiKey(trimmed);
    setGeminiPromptVisible(false);
    setShowGeminiKey(false);
    const pending = pendingGeminiActionRef.current;
    pendingGeminiActionRef.current = null;
    if (pending?.type === 'context') {
      await handleContextQuery(pending.token, pending.contextType, false, trimmed);
    } else if (pending?.type === 'analysis') {
      await handleImageAnalysis(false, trimmed);
    }
  }, [geminiInput, setGeminiApiKey, handleContextQuery, handleImageAnalysis]);

  const handleContextSentencePress = useCallback(
    async (japaneseLine: string) => {
      setContextWordsBusy(true);
      setContextWordsModal({ visible: true, words: [] });
      try {
        const geminiWords = contextGeminiWordsRef.current;
        let words: WordInfo[];
        if (geminiWords.length) {
          const surfaces = geminiWords.map((w) => w.word);
          const dictMap = await lookupWordBatch(surfaces);
          words = geminiWords.map((gw) => {
            const dict = dictMap.get(gw.word);
            if (dict) return dict;
            return { word: gw.word, reading: gw.reading, meaning: [] };
          });
        } else {
          words = await tokenizeSentenceWords(japaneseLine);
        }
        setContextWordsModal({ visible: true, words });
      } catch {
        setContextWordsModal((s) => ({ ...s, visible: false }));
        Alert.alert('Error', 'Failed to analyze sentence words.');
      } finally {
        setContextWordsBusy(false);
      }
    },
    []
  );

  const [menuPagerWidth, setMenuPagerWidth] = useState(0);

  const onMenuTabChangeStable = useCallback(
    (t: 'kanji' | 'word') => {
      onMenuTabChange(t);
    },
    [onMenuTabChange]
  );

  const menuActiveIndex = menuTab === 'kanji' ? 0 : 1;

  const handleMenuIndexChange = useCallback(
    (index: number) => {
      const nextTab: 'kanji' | 'word' = index === 0 ? 'kanji' : 'word';
      onMenuTabChangeStable(nextTab);
    },
    [onMenuTabChangeStable]
  );

  const { translateX: menuTranslateX, panResponder: menuSwipeResponder } = useSwipePager({
    activeIndex: menuActiveIndex,
    pageCount: 2,
    width: menuPagerWidth,
    onIndexChange: handleMenuIndexChange,
    // Match the old GestureHandler behavior (fail quickly on vertical scroll) to avoid stutter.
    gesture: { minDx: 12, maxDy: 12, dominanceRatio: 1.2 },
  });

  const renderBoldHighlights = useCallback((text: string, targets?: string[]): React.ReactNode[] => {
    const hlStyle = { backgroundColor: 'rgba(96,165,250,0.35)', borderRadius: 3, fontWeight: '700' as const };
    const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
    const nodes: React.ReactNode[] = [];
    let ki = 0;

    const validTargets = targets?.filter(Boolean) ?? [];
    const targetRegex = validTargets.length
      ? new RegExp(`(${validTargets.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
      : null;

    const splitByTargets = (seg: string): React.ReactNode[] => {
      if (!targetRegex) return [<Text key={ki++}>{seg}</Text>];
      const sub = seg.split(targetRegex);
      return sub.map((s) =>
        targetRegex.test(s) ? <Text key={ki++} style={hlStyle}>{s}</Text> : <Text key={ki++}>{s}</Text>
      );
    };

    for (const part of boldParts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        nodes.push(<Text key={ki++} style={hlStyle}>{part.slice(2, -2)}</Text>);
      } else {
        nodes.push(...splitByTargets(part));
      }
    }
    return nodes;
  }, []);

  return (
    <Modal
      visible={!!photo}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.fullOverlay}>
        {photo ? (
          <ImageViewer
            imageUrls={imageSources}
            index={Math.min(Math.max(imageIndex, 0), Math.max(imageSources.length - 1, 0))}
            onChange={handleIndexChanged}
            onClick={handleSingleTap}
            enableSwipeDown
            onSwipeDown={onClose}
            renderIndicator={() => null}
            saveToLocalByLongPress={false}
            enablePreload
            backgroundColor="rgba(0,0,0,0.95)"
            style={{ flex: 1 }}
          />
        ) : null}

        <TouchableOpacity style={[styles.fullClose, { top: Math.max(insets.top + 8, 32) }]} onPress={onClose}>
          <Text style={styles.fullCloseText}>✕</Text>
        </TouchableOpacity>

        {photo?.type === 'encounter' && (
          <TouchableOpacity
            style={[styles.fullClose, { top: Math.max(insets.top + 8, 32), right: undefined, left: 20 }]}
            onPress={() => handleImageAnalysis()}
          >
            <Ionicons name="help" size={20} color={colors.text} />
          </TouchableOpacity>
        )}

        {!menuVisible && (
          <View
            {...swipeUpResponder.panHandlers}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 90,
              zIndex: 2,
            }}
          />
        )}

        {menuVisible && photo && (
          <View style={[styles.fullMenu, { paddingBottom: Math.max(insets.bottom, 20) + 10, zIndex: 10 }]}>
            {editMode ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[styles.modalBtn, { flex: 1 }]} onPress={handleSaveEdits}>
                  <Text style={styles.modalBtnText}>Save Changes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel, { flex: 1 }]} onPress={() => setEditMode(false)}>
                  <Text style={styles.modalBtnText}>Cancel Editing</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: editMode ? 8 : 2,
                gap: 12,
              }}
            >
              <View style={{ flexGrow: 0, flexShrink: 1, alignSelf: 'flex-start' }}>
                <SegmentedToggle
                  options={[
                    { key: 'kanji', label: 'Kanji' },
                    { key: 'word', label: 'Words' },
                  ]}
                  value={menuTab}
                  onChange={onMenuTabChange}
                />
              </View>

              <View style={{ position: 'relative' }}>
                <TouchableOpacity
                  onPress={() => setOverflowVisible((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
                </TouchableOpacity>

                {overflowVisible && (
                  <View
                    style={{
                      position: 'absolute',
                      right: 0,
                      bottom: '100%',
                      marginBottom: 6,
                      backgroundColor: colors.surface,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      minWidth: 180,
                      paddingVertical: 4,
                      zIndex: 20,
                      elevation: 8,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.35,
                      shadowRadius: 6,
                    }}
                  >
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, gap: 10, opacity: reprocessBusy ? 0.5 : 1 }}
                      onPress={() => { setOverflowVisible(false); onReprocess(); }}
                      disabled={reprocessBusy}
                    >
                      {reprocessBusy ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="refresh" size={16} color={colors.text} />}
                      <Text style={{ color: colors.text, fontSize: 14 }}>{reprocessBusy ? 'Reprocessing…' : 'Reprocess'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, gap: 10 }}
                      onPress={() => { setOverflowVisible(false); setRetakeChoiceVisible(true); }}
                    >
                      <Ionicons name="camera-outline" size={16} color={colors.text} />
                      <Text style={{ color: colors.text, fontSize: 14 }}>Retake</Text>
                    </TouchableOpacity>
                    {!editMode && (
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, gap: 10 }}
                        onPress={() => { setOverflowVisible(false); setEditMode(true); }}
                      >
                        <Ionicons name="pencil-outline" size={16} color={colors.text} />
                        <Text style={{ color: colors.text, fontSize: 14 }}>Edit Extracted Text</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </View>

            <View
              style={{ maxHeight: 320 }}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w && w !== menuPagerWidth) setMenuPagerWidth(w);
              }}
            >
              <View {...menuSwipeResponder.panHandlers}>
                <View style={{ overflow: 'hidden' }}>
                  <Animated.View
                    style={{
                      flexDirection: 'row',
                      width: menuPagerWidth ? menuPagerWidth * 2 : '200%',
                      transform: [{ translateX: menuTranslateX }],
                    }}
                  >
                    <View style={{ width: menuPagerWidth || '50%' }}>
                      <ScrollView
                        ref={(r) => {
                          kanjiScrollRef.current = r;
                        }}
                        contentContainerStyle={{ paddingBottom: 4 }}
                        onLayout={(e) => {
                          kanjiViewportHRef.current = e.nativeEvent.layout.height;
                        }}
                        onContentSizeChange={(_, h) => {
                          kanjiContentHRef.current = h;
                        }}
                        onScroll={(e) => {
                          kanjiScrollYRef.current = clampScrollY('kanji', e.nativeEvent.contentOffset.y);
                        }}
                        scrollEventThrottle={100}
                        onMomentumScrollEnd={() =>
                          onScrollYChange({
                            kanji: clampScrollY('kanji', kanjiScrollYRef.current),
                            word: clampScrollY('word', wordScrollYRef.current),
                          })
                        }
                      >
                        {kanjiRows.length ? (
                          <View style={{ marginTop: 10 }}>
                            {kanjiRows.map(({ k, meaning }, idx) => (
                              <TouchableOpacity
                                key={`${k}-${idx}`}
                                style={styles.spottedRow}
                                onPress={() => (editMode ? openTokenEditor('kanji', idx, k) : handlePressKanjiRow(k))}
                                activeOpacity={0.85}
                              >
                                <Text style={[styles.spottedMain, { flex: 1 }]} numberOfLines={1} ellipsizeMode="tail">
                                  {k}
                                  {meaning ? <Text style={styles.spottedGloss}> — {meaning}</Text> : null}
                                </Text>
                                {!editMode && (
                                  <TouchableOpacity
                                    onPress={() => handleContextQuery(k, 'kanji')}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}
                                  >
                                    <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700', lineHeight: 16 }}>?</Text>
                                  </TouchableOpacity>
                                )}
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : (
                          <Text style={styles.mutedSmall}>None</Text>
                        )}
                      </ScrollView>
                    </View>

                    <View style={{ width: menuPagerWidth || '50%' }}>
                      <ScrollView
                        ref={(r) => {
                          wordScrollRef.current = r;
                        }}
                        contentContainerStyle={{ paddingBottom: 4 }}
                        onLayout={(e) => {
                          wordViewportHRef.current = e.nativeEvent.layout.height;
                        }}
                        onContentSizeChange={(_, h) => {
                          wordContentHRef.current = h;
                        }}
                        onScroll={(e) => {
                          wordScrollYRef.current = clampScrollY('word', e.nativeEvent.contentOffset.y);
                        }}
                        scrollEventThrottle={100}
                        onMomentumScrollEnd={() =>
                          onScrollYChange({
                            kanji: clampScrollY('kanji', kanjiScrollYRef.current),
                            word: clampScrollY('word', wordScrollYRef.current),
                          })
                        }
                      >
                        {wordRows.length ? (
                          <View style={{ marginTop: 10 }}>
                            {wordRows.map(({ w, gloss, romaji }, idx) => (
                              <TouchableOpacity
                                key={`${w}-${idx}`}
                                style={styles.spottedRow}
                                onPress={() => (editMode ? openTokenEditor('word', idx, w) : handlePressWordRow(w))}
                                activeOpacity={0.85}
                              >
                                <Text style={[styles.spottedMain, { flex: 1 }]} numberOfLines={1} ellipsizeMode="tail">
                                  {w}
                                  {romaji ? <Text style={styles.spottedGloss}> ({romaji})</Text> : null}
                                  {gloss ? <Text style={styles.spottedGloss}> — {gloss}</Text> : null}
                                </Text>
                                {!editMode && (
                                  <TouchableOpacity
                                    onPress={() => handleContextQuery(w, 'word')}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}
                                  >
                                    <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700', lineHeight: 16 }}>?</Text>
                                  </TouchableOpacity>
                                )}
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : (
                          <Text style={styles.mutedSmall}>None</Text>
                        )}
                      </ScrollView>
                    </View>
                  </Animated.View>
                </View>
              </View>
            </View>

            <TouchableOpacity style={[styles.modalBtn, styles.modalDanger]} onPress={onDelete}>
              <Text style={styles.modalBtnText}>Delete Photo</Text>
            </TouchableOpacity>
          </View>
        )}

        <Modal visible={tokenEditorVisible} transparent animationType="fade" onRequestClose={() => setTokenEditorVisible(false)}>
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setTokenEditorVisible(false)}
          >
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>{tokenKind === 'kanji' ? 'Edit Kanji' : 'Edit Word'}</Text>
                <TextInput
                  style={styles.search}
                  value={tokenValue}
                  onChangeText={setTokenValue}
                  placeholder={tokenKind === 'kanji' ? 'e.g. 公' : 'e.g. 公園'}
                  placeholderTextColor="#666"
                  autoFocus
                />
                <TouchableOpacity style={styles.modalBtn} onPress={applyTokenEdit}>
                  <Text style={styles.modalBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={() => setTokenEditorVisible(false)}>
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>

        <Modal
          visible={retakeChoiceVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRetakeChoiceVisible(false)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setRetakeChoiceVisible(false)}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Replace Photo</Text>
                <TouchableOpacity
                  style={styles.modalBtn}
                  onPress={() => {
                    setRetakeChoiceVisible(false);
                    if (photo) onRetakeCamera(photo);
                  }}
                >
                  <Text style={styles.modalBtnText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalBtn}
                  onPress={() => {
                    setRetakeChoiceVisible(false);
                    if (photo) onRetakeGallery(photo);
                  }}
                >
                  <Text style={styles.modalBtnText}>Choose from Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={() => setRetakeChoiceVisible(false)}>
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>

        <Modal
          visible={contextModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setContextModalVisible(false)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setContextModalVisible(false)}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { maxHeight: '70%' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[styles.modalTitle, { flex: 1, marginBottom: 0 }]}>Context: {contextTarget}</Text>
                  {!contextLoading && (
                    <TouchableOpacity
                      onPress={() => handleContextQuery(contextTarget, contextType, true)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.6}
                      style={{ paddingLeft: 12 }}
                    >
                      <Text style={{ color: colors.textMuted, fontSize: 16 }}>↻</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {contextLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 14 }}>Analyzing context…</Text>
                  </View>
                ) : contextError ? (
                  <Text style={{ color: colors.accent, fontSize: 14, lineHeight: 20 }}>{contextError}</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 340 }}>
                    {contextSentence ? (
                      <View style={{ marginBottom: 12 }}>
                        <TouchableOpacity
                          onPress={() => handleContextSentencePress(contextSentence.replace(/\*\*/g, ''))}
                          activeOpacity={0.7}
                          disabled={contextWordsBusy}
                        >
                          <Text style={{ color: colors.info, fontSize: 16, lineHeight: 24, fontWeight: '600' }}>
                            {renderBoldHighlights(contextSentence, [contextTarget])}
                          </Text>
                        </TouchableOpacity>
                        {contextRomaji ? (
                          <TouchableOpacity onPress={() => speakJa(contextSentence.replace(/\*\*/g, ''))} activeOpacity={0.7} style={{ marginTop: 4 }}>
                            <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20, fontStyle: 'italic' }}>
                              {renderBoldHighlights(contextRomaji, [toRomaji(contextTarget)])}
                              {'  '}
                              <Ionicons name="volume-medium-outline" size={15} color={colors.textDim} />
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                    {contextExplanation ? (
                      <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>{renderBoldHighlights(contextExplanation, [contextTarget, toRomaji(contextTarget)])}</Text>
                    ) : null}
                  </ScrollView>
                )}
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel, { marginTop: 14 }]} onPress={() => setContextModalVisible(false)}>
                  <Text style={styles.modalBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>

        <Modal
          visible={contextWordsModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() => setContextWordsModal((s) => ({ ...s, visible: false }))}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setContextWordsModal((s) => ({ ...s, visible: false }))}
          >
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { maxHeight: '70%' }]}>
                <Text style={styles.modalTitle}>Words in this sentence</Text>
                {contextWordsBusy ? (
                  <ActivityIndicator size="small" color={colors.info} style={{ marginVertical: 12 }} />
                ) : contextWordsModal.words.length === 0 ? (
                  <Text style={styles.mutedSmall}>No dictionary words found.</Text>
                ) : (
                  <ScrollView>
                    {contextWordsModal.words.map((w) => (
                      <TouchableOpacity
                        key={w.word}
                        style={styles.spottedRow}
                        onPress={() => {
                          setContextWordsModal((s) => ({ ...s, visible: false }));
                          setContextModalVisible(false);
                          onOpenDetail('word', w.word);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.spottedMain, { flex: 1 }]} numberOfLines={1} ellipsizeMode="tail">
                          {w.word}
                          {w.reading ? <Text style={styles.spottedGloss}> ({toRomaji(w.reading)})</Text> : null}
                          {w.meaning.length > 0 ? <Text style={styles.spottedGloss}> — {w.meaning.join(', ')}</Text> : null}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            setContextWordsModal((s) => ({ ...s, visible: false }));
                            handleContextQuery(w.word, 'word');
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}
                        >
                          <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700', lineHeight: 16 }}>?</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancel, { marginTop: 10 }]}
                  onPress={() => setContextWordsModal((s) => ({ ...s, visible: false }))}
                >
                  <Text style={styles.modalBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>

        <Modal visible={geminiPromptVisible} transparent animationType="fade" onRequestClose={() => setGeminiPromptVisible(false)}>
          <View style={[styles.modalOverlay, { justifyContent: 'center', paddingHorizontal: 24 }]}>
            <View style={[styles.modalCard, { borderRadius: 16 }]}>
              <Text style={styles.modalTitle}>Gemini API Key Required</Text>
              <Text style={[styles.mutedSmall, { marginBottom: 8 }]}>
                Enter your Gemini API key to use AI-powered features.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: colors.surfaceDark,
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    color: colors.text,
                    fontWeight: '600',
                  }}
                  value={geminiInput}
                  onChangeText={setGeminiInput}
                  placeholder="Paste your Gemini API key"
                  placeholderTextColor={colors.textDim}
                  secureTextEntry={!showGeminiKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowGeminiKey((v) => !v)}
                  style={{ backgroundColor: colors.surfaceDark, borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center' }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: colors.textMuted, fontWeight: '700' }}>{showGeminiKey ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={saveGeminiKeyAndRetry}
                style={[styles.modalBtn, { backgroundColor: colors.info, marginTop: 8, opacity: geminiInput.trim() ? 1 : 0.65 }]}
                activeOpacity={0.8}
                disabled={!geminiInput.trim()}
              >
                <Text style={[styles.modalBtnText, { color: colors.dark }]}>Save Key</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setGeminiPromptVisible(false)} style={styles.modalBtn} activeOpacity={0.8}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={analysisModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAnalysisModalVisible(false)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAnalysisModalVisible(false)}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { maxHeight: '70%' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[styles.modalTitle, { flex: 1, marginBottom: 0 }]}>Image Summary</Text>
                  {!analysisLoading && (
                    <TouchableOpacity
                      onPress={() => handleImageAnalysis(true)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.6}
                      style={{ paddingLeft: 12 }}
                    >
                      <Text style={{ color: colors.textMuted, fontSize: 16 }}>↻</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {analysisLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 14 }}>Analyzing image…</Text>
                  </View>
                ) : analysisError ? (
                  <Text style={{ color: colors.accent, fontSize: 14, lineHeight: 20 }}>{analysisError}</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 340 }}>
                    <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>{analysisText}</Text>
                  </ScrollView>
                )}
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel, { marginTop: 14 }]} onPress={() => setAnalysisModalVisible(false)}>
                  <Text style={styles.modalBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
}
