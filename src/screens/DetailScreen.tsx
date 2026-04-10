import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Animated,
  Dimensions,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { styles, colors } from '../styles/theme';
import { useAppContext } from '../context/AppContext';
import { useSpeech } from '../hooks';
import { PhotoThumbnail, EmptyState, SegmentedToggle } from '../components';
import { useSwipePager } from '../hooks';
import { GalleryType, PhotoEntry } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPreference, setPreference } from '../../utils/preferences';
import { generateExampleSentence, ExampleSentenceError, ExampleSentenceResult } from '../../services/exampleSentence';
import { generateMnemonic, MnemonicError, MnemonicResult } from '../../services/mnemonic';
import { tokenizeSentenceWords, lookupWordBatch, WordInfo } from '../../services/dictionary';
import { generateContextExplanation } from '../../services/contextExplanation';
import { loadContextCache, parseContextResponse, saveContextCacheEntry } from '../../services/contextExplanationShared';
import { processImage } from '../../services/ocr';
import { updatePhotoOcrText } from '../../services/database';
import { toRomaji } from 'wanakana';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';

type PendingGeminiDetail =
  | { kind: 'example' }
  | { kind: 'mnemonic' }
  | { kind: 'photoContext'; photo: PhotoEntry; token: string; type: 'kanji' | 'word' };

export function DetailScreen() {
  const {
    detail,
    detailPhotos,
    detailKanjiInfo,
    detailWordInfo,
    detailWordsSpotted,
    detailLoading,
    metaCache,
    openDetail,
    openFullImage,
    onDeletePhoto,
    setWordKanjiModal,
    toggleFavorite,
    isFavorite,
    geminiApiKey,
    setGeminiApiKey,
    apiKey,
  } = useAppContext();

  const insets = useSafeAreaInsets();
  const { speakJa } = useSpeech();

  const [photoType, setPhotoType] = useState<GalleryType>('encounter');
  const [photosWidth, setPhotosWidth] = useState(() => Dimensions.get('window').width);
  const [exampleSentence, setExampleSentence] = useState<ExampleSentenceResult | null>(null);
  const [exampleBusy, setExampleBusy] = useState(false);
  const [geminiPromptVisible, setGeminiPromptVisible] = useState(false);
  const [geminiInput, setGeminiInput] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [sentenceWordsModal, setSentenceWordsModal] = useState<{ visible: boolean; words: WordInfo[] }>({ visible: false, words: [] });
  const [sentenceWordsBusy, setSentenceWordsBusy] = useState(false);
  const [mnemonic, setMnemonic] = useState<MnemonicResult | null>(null);
  const [mnemonicBusy, setMnemonicBusy] = useState(false);
  const [photoContextMenu, setPhotoContextMenu] = useState<{ visible: boolean; photo: PhotoEntry | null }>({
    visible: false,
    photo: null,
  });
  const pendingGeminiRef = useRef<PendingGeminiDetail | null>(null);
  const imageContextOcrCacheRef = useRef<Record<number, string>>({});
  const imageContextGeminiWordsRef = useRef<Array<{ word: string; reading: string }>>([]);
  const imageContextPhotoRef = useRef<PhotoEntry | null>(null);

  const [imageContextModalVisible, setImageContextModalVisible] = useState(false);
  const [imageContextLoading, setImageContextLoading] = useState(false);
  const [imageContextSentence, setImageContextSentence] = useState('');
  const [imageContextRomaji, setImageContextRomaji] = useState('');
  const [imageContextExplanation, setImageContextExplanation] = useState('');
  const [imageContextTarget, setImageContextTarget] = useState('');
  const [imageContextKind, setImageContextKind] = useState<'kanji' | 'word'>('word');
  const [imageContextError, setImageContextError] = useState('');

  const [imageContextWordsModal, setImageContextWordsModal] = useState<{ visible: boolean; words: WordInfo[] }>({
    visible: false,
    words: [],
  });
  const [imageContextWordsBusy, setImageContextWordsBusy] = useState(false);

  const photosActiveIndex = photoType === 'encounter' ? 0 : 1;

  const normalizeExampleCacheValue = useCallback((v: any): ExampleSentenceResult | null => {
    if (!v || typeof v !== 'object') return null;
    if (typeof v.content === 'string' && v.content.trim()) {
      return { content: v.content.trim() };
    }

    // Backward compatibility for older cached structured shape.
    const parts: string[] = [];
    if (typeof v.japanese === 'string' && v.japanese.trim()) parts.push(v.japanese.trim());
    if (typeof v.romaji === 'string' && v.romaji.trim()) parts.push(v.romaji.trim());
    if (typeof v.english === 'string' && v.english.trim()) parts.push(v.english.trim());
    if (typeof v.usage === 'string' && v.usage.trim()) parts.push(`Usage: ${v.usage.trim()}`);
    if (typeof v.nuance === 'string' && v.nuance.trim()) parts.push(`Nuance: ${v.nuance.trim()}`);
    if (!parts.length) return null;
    return { content: parts.join('\n') };
  }, []);

  const exampleCacheKey = detail ? `${detail.type}:${detail.id}` : null;
  const mnemonicCacheKey = detail ? `mnemonic:${detail.type}:${detail.id}` : null;

  useEffect(() => {
    setGeminiInput(geminiApiKey ?? '');
  }, [geminiApiKey]);

  useEffect(() => {
    let cancelled = false;
    if (!exampleCacheKey) {
      setExampleSentence(null);
      return;
    }
    (async () => {
      const raw = await getPreference('exampleSentenceCache');
      if (!raw) {
        if (!cancelled) setExampleSentence(null);
        return;
      }
      try {
        const cache = JSON.parse(raw) as Record<string, ExampleSentenceResult>;
        if (!cancelled) setExampleSentence(normalizeExampleCacheValue(cache[exampleCacheKey]));
      } catch {
        if (!cancelled) setExampleSentence(null);
      }
    })().catch(() => {
      if (!cancelled) setExampleSentence(null);
    });
    return () => {
      cancelled = true;
    };
  }, [exampleCacheKey, normalizeExampleCacheValue]);

  useEffect(() => {
    let cancelled = false;
    if (!mnemonicCacheKey) {
      setMnemonic(null);
      return;
    }
    (async () => {
      const raw = await getPreference('mnemonicCache');
      if (!raw) {
        if (!cancelled) setMnemonic(null);
        return;
      }
      try {
        const cache = JSON.parse(raw) as Record<string, MnemonicResult>;
        const val = cache[mnemonicCacheKey];
        if (!cancelled) setMnemonic(val && typeof val.content === 'string' && val.content.trim() ? val : null);
      } catch {
        if (!cancelled) setMnemonic(null);
      }
    })().catch(() => {
      if (!cancelled) setMnemonic(null);
    });
    return () => {
      cancelled = true;
    };
  }, [mnemonicCacheKey]);

  const persistMnemonicForCurrentItem = useCallback(
    async (result: MnemonicResult) => {
      if (!mnemonicCacheKey) return;
      const raw = await getPreference('mnemonicCache');
      let cache: Record<string, MnemonicResult> = {};
      if (raw) {
        try {
          cache = JSON.parse(raw) as Record<string, MnemonicResult>;
        } catch {
          cache = {};
        }
      }
      cache[mnemonicCacheKey] = result;
      await setPreference('mnemonicCache', JSON.stringify(cache));
      setMnemonic(result);
    },
    [mnemonicCacheKey]
  );

  const createMnemonic = useCallback(
    async (keyOverride?: string) => {
      if (!detail) return;
      const activeKey = keyOverride?.trim() || geminiApiKey || '';
      if (!activeKey) {
        pendingGeminiRef.current = { kind: 'mnemonic' };
        setGeminiPromptVisible(true);
        return;
      }

      setMnemonicBusy(true);
      try {
        const result = await generateMnemonic(activeKey, {
          type: detail.type,
          text: detail.id,
          reading: detail.type === 'word' ? detailWordInfo?.reading ?? null : null,
          meaning: detail.type === 'word' ? detailWordInfo?.meaning?.join(', ') ?? null : detailKanjiInfo?.meanings?.join(', ') ?? null,
        });
        await persistMnemonicForCurrentItem(result);
      } catch (error) {
        const message = error instanceof MnemonicError ? error.message : 'Failed to generate a mnemonic.';
        Alert.alert('Error', message);
      } finally {
        setMnemonicBusy(false);
      }
    },
    [detail, detailKanjiInfo?.meanings, detailWordInfo?.meaning, detailWordInfo?.reading, geminiApiKey, persistMnemonicForCurrentItem]
  );

  const onPressCreateMnemonic = useCallback(() => {
    if (!geminiApiKey) {
      pendingGeminiRef.current = { kind: 'mnemonic' };
      setGeminiPromptVisible(true);
      return;
    }
    createMnemonic().catch(() => {});
  }, [createMnemonic, geminiApiKey]);

  const persistExampleForCurrentItem = useCallback(
    async (result: ExampleSentenceResult) => {
      if (!exampleCacheKey) return;
      const raw = await getPreference('exampleSentenceCache');
      let cache: Record<string, ExampleSentenceResult> = {};
      if (raw) {
        try {
          cache = JSON.parse(raw) as Record<string, ExampleSentenceResult>;
        } catch {
          cache = {};
        }
      }
      cache[exampleCacheKey] = result;
      await setPreference('exampleSentenceCache', JSON.stringify(cache));
      setExampleSentence(result);
    },
    [exampleCacheKey]
  );

  const createExample = useCallback(
    async (keyOverride?: string) => {
      if (!detail) return;
      const activeKey = keyOverride?.trim() || geminiApiKey || '';
      if (!activeKey) {
        pendingGeminiRef.current = { kind: 'example' };
        setGeminiPromptVisible(true);
        return;
      }

      setExampleBusy(true);
      try {
        const result = await generateExampleSentence(activeKey, {
          type: detail.type,
          text: detail.id,
          reading: detail.type === 'word' ? detailWordInfo?.reading ?? null : null,
          meaning: detail.type === 'word' ? detailWordInfo?.meaning?.join(', ') ?? null : detailKanjiInfo?.meanings?.join(', ') ?? null,
        });
        await persistExampleForCurrentItem(result);
      } catch (error) {
        const message = error instanceof ExampleSentenceError ? error.message : 'Failed to generate an example.';
        Alert.alert('Error', message);
      } finally {
        setExampleBusy(false);
      }
    },
    [detail, detailKanjiInfo?.meanings, detailWordInfo?.meaning, detailWordInfo?.reading, geminiApiKey, persistExampleForCurrentItem]
  );

  const runImageContextQuery = useCallback(
    async (
      photo: PhotoEntry,
      token: string,
      contextType: 'kanji' | 'word',
      keyOverride?: string,
      forceRefresh = false
    ) => {
      const activeKey = keyOverride?.trim() || geminiApiKey || '';
      if (!activeKey) {
        pendingGeminiRef.current = { kind: 'photoContext', photo, token, type: contextType };
        setGeminiPromptVisible(true);
        return;
      }

      imageContextPhotoRef.current = photo;
      setImageContextTarget(token);
      setImageContextKind(contextType);
      setImageContextError('');
      setImageContextModalVisible(true);

      const cacheKey = `${photo.id}:${contextType}:${token}`;

      if (!forceRefresh) {
        try {
          const cache = await loadContextCache();
          const cached = cache[cacheKey];
          if (cached) {
            setImageContextSentence(cached.sentence);
            setImageContextRomaji(cached.romaji);
            setImageContextExplanation(cached.explanation);
            imageContextGeminiWordsRef.current = cached.words ?? [];
            setImageContextLoading(false);
            return;
          }
        } catch {
          /* use network */
        }
      }

      setImageContextSentence('');
      setImageContextRomaji('');
      setImageContextExplanation('');
      setImageContextLoading(true);

      try {
        let ocrText = photo.ocr_text;
        if (!ocrText) {
          const ocrCached = imageContextOcrCacheRef.current[photo.id];
          if (ocrCached) {
            ocrText = ocrCached;
          } else {
            if (!apiKey) {
              setImageContextError('No Cloud Vision API key configured. Cannot extract text for context.');
              setImageContextLoading(false);
              return;
            }
            const ocr = await processImage(photo.uri, apiKey, photo.type === 'practice');
            ocrText = ocr.text;
            if (ocrText) {
              imageContextOcrCacheRef.current[photo.id] = ocrText;
              await updatePhotoOcrText(photo.id, ocrText).catch(() => {});
            }
          }
        }

        if (!ocrText) {
          setImageContextError('No text could be extracted from this image.');
          setImageContextLoading(false);
          return;
        }

        const result = await generateContextExplanation(activeKey, {
          type: contextType,
          text: token,
          fullOcrText: ocrText,
        });

        const parsed = parseContextResponse(result.content);
        await saveContextCacheEntry(cacheKey, parsed).catch(() => {});
        setImageContextSentence(parsed.sentence);
        setImageContextRomaji(parsed.romaji);
        setImageContextExplanation(parsed.explanation);
        imageContextGeminiWordsRef.current = parsed.words ?? [];
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to generate context explanation.';
        setImageContextError(message);
      } finally {
        setImageContextLoading(false);
      }
    },
    [apiKey, geminiApiKey]
  );

  const handleImageContextSentencePress = useCallback(
    async (japaneseLine: string) => {
      setImageContextWordsBusy(true);
      setImageContextWordsModal({ visible: true, words: [] });
      try {
        const geminiWords = imageContextGeminiWordsRef.current;
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
        setImageContextWordsModal({ visible: true, words });
      } catch {
        setImageContextWordsModal((s) => ({ ...s, visible: false }));
        Alert.alert('Error', 'Failed to analyze sentence words.');
      } finally {
        setImageContextWordsBusy(false);
      }
    },
    []
  );

  const renderBoldHighlightsForImageContext = useCallback((text: string, targets?: string[]): React.ReactNode[] => {
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
        targetRegex.test(s) ? (
          <Text key={ki++} style={hlStyle}>
            {s}
          </Text>
        ) : (
          <Text key={ki++}>{s}</Text>
        )
      );
    };

    for (const part of boldParts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        nodes.push(
          <Text key={ki++} style={hlStyle}>
            {part.slice(2, -2)}
          </Text>
        );
      } else {
        nodes.push(...splitByTargets(part));
      }
    }
    return nodes;
  }, []);

  const saveGeminiKeyAndGenerate = useCallback(async () => {
    const trimmed = geminiInput.trim();
    if (!trimmed) return;
    const pending = pendingGeminiRef.current;
    pendingGeminiRef.current = null;
    await setGeminiApiKey(trimmed);
    setGeminiPromptVisible(false);
    setShowGeminiKey(false);
    if (pending?.kind === 'mnemonic') {
      await createMnemonic(trimmed);
    } else if (pending?.kind === 'photoContext') {
      await runImageContextQuery(pending.photo, pending.token, pending.type, trimmed, false);
    } else {
      await createExample(trimmed);
    }
  }, [createExample, createMnemonic, geminiInput, runImageContextQuery, setGeminiApiKey]);

  const onPressCreateExample = useCallback(() => {
    if (!geminiApiKey) {
      pendingGeminiRef.current = { kind: 'example' };
      setGeminiPromptVisible(true);
      return;
    }
    createExample().catch(() => {});
  }, [createExample, geminiApiKey]);

  const onPressSentenceLine = useCallback(
    async (japaneseLine: string) => {
      setSentenceWordsBusy(true);
      setSentenceWordsModal({ visible: true, words: [] });
      try {
        const words = await tokenizeSentenceWords(japaneseLine);
        setSentenceWordsModal({ visible: true, words });
      } catch {
        setSentenceWordsModal((s) => ({ ...s, visible: false }));
        Alert.alert('Error', 'Failed to analyze sentence words.');
      } finally {
        setSentenceWordsBusy(false);
      }
    },
    []
  );

  const handlePhotosIndexChange = useCallback(
    (index: number) => {
      const nextType: GalleryType = index === 0 ? 'encounter' : 'practice';
      setPhotoType(nextType);
    },
    []
  );

  const { translateX: photosTranslateX, panResponder: photosSwipeResponder } = useSwipePager({
    activeIndex: photosActiveIndex,
    pageCount: 2,
    width: photosWidth,
    onIndexChange: handlePhotosIndexChange,
  });

  const encounterPhotos = useMemo(() => detailPhotos.filter((p) => p.type === 'encounter'), [detailPhotos]);
  const practicePhotos = useMemo(() => detailPhotos.filter((p) => p.type === 'practice'), [detailPhotos]);

  const uniqueReadings = useCallback((readings: string[]) => {
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

  const detailWordRomaji = useMemo(() => {
    if (!detail || detail.type !== 'word') return '';
    if (Array.from(detail.id).length <= 1) return '';
    const base = detailWordInfo?.reading?.trim() || detail.id;
    const romaji = toRomaji(base).trim();
    return romaji;
  }, [detail, detailWordInfo?.reading]);

  const renderHighlightedText = useCallback(
    (text: string, baseStyle: any, enableWordLinks: boolean = false) => {
      const parts = text.split(/(\*\*[^*]+\*\*)/g);
      const wordPattern = /([\u3400-\u4DBF\u4E00-\u9FFF\u3005\u3040-\u309F\u30A0-\u30FFー]+)/g;
      const nodes: React.ReactNode[] = [];
      let keyIndex = 0;

      for (const part of parts) {
        if (part.startsWith('**') && part.endsWith('**')) {
          nodes.push(
            <Text key={`hl-${keyIndex++}`} style={{ backgroundColor: 'rgba(96,165,250,0.35)', borderRadius: 3, fontWeight: '700' }}>
              {part.slice(2, -2)}
            </Text>
          );
          continue;
        }

        if (!enableWordLinks) {
          nodes.push(<Text key={`txt-${keyIndex++}`}>{part}</Text>);
          continue;
        }

        let last = 0;
        wordPattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = wordPattern.exec(part)) !== null) {
          const start = match.index;
          const end = start + match[0].length;
          if (start > last) {
            nodes.push(<Text key={`txt-${keyIndex++}`}>{part.slice(last, start)}</Text>);
          }
          const word = match[1];
          const hasKanji = /[\u3400-\u4DBF\u4E00-\u9FFF\u3005]/.test(word);
          if (!hasKanji) {
            nodes.push(<Text key={`txt-${keyIndex++}`}>{word}</Text>);
            last = end;
            continue;
          }
          nodes.push(
            <Text
              key={`lnk-${keyIndex++}`}
              style={{ color: colors.info }}
              onPress={() => {
                openDetail('word', word).catch(() => {});
              }}
            >
              {word}
            </Text>
          );
          last = end;
        }
        if (last < part.length) {
          nodes.push(<Text key={`txt-${keyIndex++}`}>{part.slice(last)}</Text>);
        }
      }

      return <Text style={baseStyle}>{nodes}</Text>;
    },
    [openDetail]
  );

  const renderExampleContent = useCallback((content: string) => {
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return null;
    const sentenceLines = lines.length >= 3 ? lines.slice(-3) : lines;
    const explanationLines = lines.length >= 3 ? lines.slice(0, -3) : [];
    const japaneseLine = sentenceLines[0] ?? '';

    return (
      <>
        {explanationLines.length > 0 ? (
          <View style={{ marginBottom: 6 }}>
            {explanationLines.map((line, index) => (
              <View
                key={`explain-line-${index}`}
                style={{ flexDirection: 'row', marginBottom: index < explanationLines.length - 1 ? 6 : 0 }}
              >
                <Text style={[styles.detailInfoValue, { marginRight: 8 }]}>-</Text>
                <View style={{ flex: 1 }}>
                  {renderHighlightedText(line, [styles.detailInfoValue, { lineHeight: 20 }], true)}
                </View>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ marginTop: 6, marginBottom: 2 }}>
          <Text style={styles.detailInfoLabel}>Example sentence</Text>
        </View>
        <View key="example-sentence-block" style={{ flexDirection: 'row' }}>
          <Text style={[styles.detailInfoValue, { marginRight: 8 }]}>-</Text>
          <View style={{ flex: 1 }}>
            {sentenceLines[0] ? (
              <TouchableOpacity onPress={() => onPressSentenceLine(sentenceLines[0])} activeOpacity={0.7} disabled={sentenceWordsBusy}>
                {renderHighlightedText(sentenceLines[0], [styles.detailInfoValue, { lineHeight: 20, color: colors.info }])}
              </TouchableOpacity>
            ) : null}
            {sentenceLines[1] ? (
              <TouchableOpacity onPress={() => speakJa(japaneseLine.replace(/\*\*/g, ''))} activeOpacity={0.7} style={{ marginTop: 4 }}>
                <Text style={[styles.detailInfoValue, { lineHeight: 20, fontStyle: 'italic' }]}>
                  {sentenceLines[1].split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
                    seg.startsWith('**') && seg.endsWith('**') ? (
                      <Text key={i} style={{ backgroundColor: 'rgba(96,165,250,0.35)', borderRadius: 3, fontWeight: '700' }}>
                        {seg.slice(2, -2)}
                      </Text>
                    ) : (
                      <Text key={i}>{seg}</Text>
                    )
                  )}
                  {'  '}
                  <Ionicons name="volume-medium-outline" size={15} color={colors.textDim} />
                </Text>
              </TouchableOpacity>
            ) : null}
            {sentenceLines[2] ? (
              <View style={{ marginTop: 6 }}>
                {renderHighlightedText(`(${sentenceLines[2]})`, [styles.detailInfoValue, { lineHeight: 20, fontSize: 13, fontStyle: 'italic' }])}
              </View>
            ) : null}
          </View>
        </View>
      </>
    );
  }, [renderHighlightedText, onPressSentenceLine, sentenceWordsBusy, speakJa]);

  const headerComponent = useMemo(() => {
    if (!detail) return null;
    return (
      <View style={styles.detailHeader}>
        {detail.type === 'word' ? (
          (() => {
            const hasKanji = /[\u4e00-\u9faf]/.test(detail.id);
            const copyTitle = () => {
              Clipboard.setStringAsync(detail.id).catch(() => {});
            };
            const titleContent = (
              <Text style={styles.detailTitle}>
                {detail.id}
                {detailWordRomaji ? <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textMuted }}> ({detailWordRomaji})</Text> : null}
              </Text>
            );
            return hasKanji ? (
              <TouchableOpacity onPress={() => setWordKanjiModal((s) => ({ ...s, visible: true }))} onLongPress={copyTitle} activeOpacity={0.8}>
                {titleContent}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onLongPress={copyTitle} activeOpacity={1}>
                {titleContent}
              </TouchableOpacity>
            );
          })()
        ) : (
          <TouchableOpacity
            onLongPress={() => {
              Clipboard.setStringAsync(detail.id).catch(() => {});
            }}
            activeOpacity={1}
          >
            <Text style={styles.detailTitle}>{detail.id}</Text>
          </TouchableOpacity>
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
                <Text style={styles.detailInfoLabel}>On'yomi</Text>
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
                <Text style={styles.detailInfoLabel}>Kun'yomi</Text>
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

        <View style={styles.detailInfoCard}>
          {exampleSentence ? (
            <View style={{ gap: 6 }}>
              <Text style={styles.detailInfoLabel}>Explanation</Text>
              {renderExampleContent(exampleSentence.content)}
            </View>
          ) : null}
          <TouchableOpacity
            onPress={onPressCreateExample}
            style={{
              backgroundColor: colors.info,
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
              marginTop: exampleSentence ? 8 : 0,
              opacity: exampleBusy ? 0.7 : 1,
            }}
            activeOpacity={0.8}
            disabled={exampleBusy}
          >
            {exampleBusy ? (
              <ActivityIndicator size="small" color={colors.dark} />
            ) : (
              <Text style={{ color: colors.dark, fontWeight: '800' }}>
                {exampleSentence ? 'Get Another Example' : 'Explain It!'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.detailInfoCard}>
          {mnemonic ? (
            <View style={{ gap: 6 }}>
              {(() => {
                const raw = mnemonic.content;
                const mnemonicMatch = raw.match(/\[MNEMONIC\]([\s\S]*?)\[\/MNEMONIC\]/);
                const radicalsMatch = raw.match(/\[RADICALS\]([\s\S]*?)\[\/RADICALS\]/);

                let body = raw;
                if (mnemonicMatch) body = body.replace(mnemonicMatch[0], '');
                if (radicalsMatch) body = body.replace(radicalsMatch[0], '');

                const bodyLines = body.split('\n').map((l) => l.trim()).filter(Boolean);

                const radicalLines = radicalsMatch
                  ? radicalsMatch[1].split('\n').map((l) => l.trim().replace(/^-\s*/, '')).filter(Boolean)
                  : [];

                const mnemonicText = mnemonicMatch
                  ? mnemonicMatch[1].trim()
                  : bodyLines.join('\n');

                const displayBodyLines = mnemonicMatch ? bodyLines : [];

                const linkifyKanji = (text: string, baseStyle: any, keyPrefix: string) => {
                  const cleaned = text.replace(/\*+/g, '').replace(/_([^_]+)_/g, '$1');
                  const tokenPattern = /(\[B\][\s\S]*?\[\/B\])|([\u3400-\u4DBF\u4E00-\u9FFF\u3005]+)/gi;
                  const nodes: React.ReactNode[] = [];
                  let last = 0;
                  let ki = 0;
                  tokenPattern.lastIndex = 0;
                  let m: RegExpExecArray | null;
                  while ((m = tokenPattern.exec(cleaned)) !== null) {
                    if (m.index > last) {
                      nodes.push(<Text key={`${keyPrefix}-t${ki++}`}>{cleaned.slice(last, m.index).replace(/\[\/?B\]/gi, '')}</Text>);
                    }
                    if (m[1]) {
                      nodes.push(
                        <Text key={`${keyPrefix}-b${ki++}`} style={{ fontWeight: '800' }}>
                          {m[1].slice(3, -4)}
                        </Text>
                      );
                    } else {
                      const kw = m[2];
                      const type = kw.length === 1 ? 'kanji' : 'word';
                      nodes.push(
                        <Text
                          key={`${keyPrefix}-k${ki++}`}
                          style={{ color: colors.info }}
                          onPress={() => { openDetail(type as 'kanji' | 'word', kw).catch(() => {}); }}
                        >
                          {kw}
                        </Text>
                      );
                    }
                    last = m.index + m[0].length;
                  }
                  if (last < cleaned.length) {
                    nodes.push(<Text key={`${keyPrefix}-t${ki++}`}>{cleaned.slice(last).replace(/\[\/?B\]/gi, '')}</Text>);
                  }
                  return <Text style={baseStyle}>{nodes}</Text>;
                };

                return (
                  <>
                    {radicalLines.length > 0 && (
                      <View>
                        <Text style={styles.detailInfoLabel}>{detail.type === 'kanji' ? 'Radicals' : 'Kanji'}</Text>
                        {radicalLines.map((line, idx) => (
                          <View key={`radical-${idx}`} style={{ flexDirection: 'row', marginTop: 4 }}>
                            <Text style={[styles.detailInfoValue, { marginRight: 8 }]}>-</Text>
                            <View style={{ flex: 1 }}>
                              {linkifyKanji(line, [styles.detailInfoValue, { lineHeight: 20 }], `rad-${idx}`)}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                    <Text style={styles.detailInfoLabel}>Mnemonic</Text>
                    {displayBodyLines.map((line, idx) => (
                      <View key={`mnem-body-${idx}`}>
                        {linkifyKanji(line, [styles.detailInfoValue, { lineHeight: 20 }], `mbody-${idx}`)}
                      </View>
                    ))}
                    {mnemonicText ? (
                      <View style={{
                        marginTop: 8,
                        backgroundColor: colors.surface,
                        borderRadius: 10,
                        padding: 12,
                        borderLeftWidth: 3,
                        borderLeftColor: colors.info,
                      }}>
                        {linkifyKanji(mnemonicText, [styles.detailInfoValue, { lineHeight: 22, fontStyle: 'italic' }], 'mnem-snip')}
                      </View>
                    ) : null}
                  </>
                );
              })()}
            </View>
          ) : null}
          <TouchableOpacity
            onPress={onPressCreateMnemonic}
            style={{
              backgroundColor: colors.info,
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
              marginTop: mnemonic ? 8 : 0,
              opacity: mnemonicBusy ? 0.7 : 1,
            }}
            activeOpacity={0.8}
            disabled={mnemonicBusy}
          >
            {mnemonicBusy ? (
              <ActivityIndicator size="small" color={colors.dark} />
            ) : (
              <Text style={{ color: colors.dark, fontWeight: '800' }}>
                {mnemonic ? 'Get Another Mnemonic' : 'Remember It!'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

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

        <View style={{ flexDirection: 'row', marginTop: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <SegmentedToggle
            options={[
              { key: 'encounter', label: 'Encounters' },
              { key: 'practice', label: 'Practice' },
            ]}
            value={photoType}
            onChange={setPhotoType}
          />
          <TouchableOpacity
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.surfaceDark,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 12,
            }}
            onPress={() => {
              if (detail) {
                toggleFavorite(detail.type, detail.id, detail.wordAliases);
              }
            }}
            activeOpacity={0.8}
            accessibilityLabel={detail && isFavorite(detail.type, detail.id) ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Text style={{ fontSize: 20, color: detail && isFavorite(detail.type, detail.id) ? '#e94560' : colors.text }}>
              {detail && isFavorite(detail.type, detail.id) ? '♥' : '♡'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [
    detail,
    detailKanjiInfo,
    detailWordInfo,
    detailWordsSpotted,
    metaCache,
    openDetail,
    photoType,
    setWordKanjiModal,
    speakJa,
    uniqueReadings,
    toggleFavorite,
    isFavorite,
    exampleSentence,
    exampleBusy,
    onPressCreateExample,
    renderExampleContent,
    detailWordRomaji,
    sentenceWordsBusy,
    mnemonic,
    mnemonicBusy,
    onPressCreateMnemonic,
  ]);

  if (!detail) {
    return <EmptyState message="No detail selected." />;
  }

  const renderPhotoGrid = (photos: typeof encounterPhotos, emptyMsg: string) => {
    if (detailLoading) return <EmptyState loading message="" />;
    if (photos.length === 0) return <EmptyState message={emptyMsg} />;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 12 }}>
        {photos.map((item) => (
          <PhotoThumbnail
            key={item.id}
            photo={item}
            onPress={() => openFullImage(item, { photos })}
            onLongPress={() => setPhotoContextMenu({ visible: true, photo: item })}
          />
        ))}
      </View>
    );
  };

  return (
    <>
      <Modal
        visible={photoContextMenu.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoContextMenu({ visible: false, photo: null })}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setPhotoContextMenu({ visible: false, photo: null })}
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.overlayHeavy,
            paddingHorizontal: 28,
          }}
        >
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.modalCard,
                {
                  alignSelf: 'stretch',
                  maxWidth: 340,
                  borderRadius: 16,
                  paddingBottom: 20,
                  paddingTop: 20,
                },
              ]}
            >
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: 'rgba(96, 165, 250, 0.22)' }]}
                activeOpacity={0.8}
                onPress={() => {
                  const p = photoContextMenu.photo;
                  if (!detail || !p) return;
                  setPhotoContextMenu({ visible: false, photo: null });
                  runImageContextQuery(p, detail.id, detail.type).catch(() => {});
                }}
              >
                <Text style={[styles.modalBtnText, { color: colors.info }]}>Context in this Image</Text>
              </TouchableOpacity>

              <View
                style={{
                  marginTop: 18,
                  borderTopWidth: 1,
                  borderTopColor: colors.borderSubtle,
                  paddingTop: 14,
                  paddingBottom: 4,
                  alignItems: 'center',
                }}
              >
                <TouchableOpacity
                  activeOpacity={0.65}
                  hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
                  onPress={() => {
                    const p = photoContextMenu.photo;
                    setPhotoContextMenu({ visible: false, photo: null });
                    if (p) onDeletePhoto(p);
                  }}
                >
                  <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 14 }}>Delete Image</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={imageContextModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageContextModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setImageContextModalVisible(false)}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalCard, { maxHeight: '70%' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.modalTitle, { flex: 1, marginBottom: 0 }]}>Context: {imageContextTarget}</Text>
                {!imageContextLoading ? (
                  <TouchableOpacity
                    onPress={() => {
                      const photo = imageContextPhotoRef.current;
                      if (photo) runImageContextQuery(photo, imageContextTarget, imageContextKind, undefined, true);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.6}
                    style={{ paddingLeft: 12 }}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 16 }}>↻</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {imageContextLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 14 }}>Analyzing context…</Text>
                </View>
              ) : imageContextError ? (
                <Text style={{ color: colors.accent, fontSize: 14, lineHeight: 20 }}>{imageContextError}</Text>
              ) : (
                <ScrollView style={{ maxHeight: 340 }}>
                  {imageContextSentence ? (
                    <View style={{ marginBottom: 12 }}>
                      <TouchableOpacity
                        onPress={() => handleImageContextSentencePress(imageContextSentence.replace(/\*\*/g, ''))}
                        activeOpacity={0.7}
                        disabled={imageContextWordsBusy}
                      >
                        <Text style={{ color: colors.info, fontSize: 16, lineHeight: 24, fontWeight: '600' }}>
                          {renderBoldHighlightsForImageContext(imageContextSentence, [imageContextTarget])}
                        </Text>
                      </TouchableOpacity>
                      {imageContextRomaji ? (
                        <TouchableOpacity
                          onPress={() => speakJa(imageContextSentence.replace(/\*\*/g, ''))}
                          activeOpacity={0.7}
                          style={{ marginTop: 4 }}
                        >
                          <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20, fontStyle: 'italic' }}>
                            {renderBoldHighlightsForImageContext(imageContextRomaji, [toRomaji(imageContextTarget)])}{' '}
                            <Ionicons name="volume-medium-outline" size={15} color={colors.textDim} />
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                  {imageContextExplanation ? (
                    <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
                      {renderBoldHighlightsForImageContext(imageContextExplanation, [
                        imageContextTarget,
                        toRomaji(imageContextTarget),
                      ])}
                    </Text>
                  ) : null}
                </ScrollView>
              )}
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancel, { marginTop: 14 }]}
                onPress={() => setImageContextModalVisible(false)}
              >
                <Text style={styles.modalBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={imageContextWordsModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageContextWordsModal((s) => ({ ...s, visible: false }))}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setImageContextWordsModal((s) => ({ ...s, visible: false }))}
        >
          <TouchableWithoutFeedback>
            <View style={[styles.modalCard, { maxHeight: '70%' }]}>
              <Text style={styles.modalTitle}>Words in this sentence</Text>
              {imageContextWordsBusy ? (
                <ActivityIndicator size="small" color={colors.info} style={{ marginVertical: 12 }} />
              ) : imageContextWordsModal.words.length === 0 ? (
                <Text style={styles.mutedSmall}>No dictionary words found.</Text>
              ) : (
                <ScrollView>
                  {imageContextWordsModal.words.map((w) => (
                    <TouchableOpacity
                      key={w.word}
                      style={styles.spottedRow}
                      onPress={() => {
                        setImageContextWordsModal((s) => ({ ...s, visible: false }));
                        setImageContextModalVisible(false);
                        openDetail('word', w.word).catch(() => {});
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
                          setImageContextWordsModal((s) => ({ ...s, visible: false }));
                          const photo = imageContextPhotoRef.current;
                          if (photo) runImageContextQuery(photo, w.word, 'word').catch(() => {});
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          borderWidth: 1.5,
                          borderColor: colors.textMuted,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginLeft: 8,
                        }}
                      >
                        <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700', lineHeight: 16 }}>?</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancel, { marginTop: 10 }]}
                onPress={() => setImageContextWordsModal((s) => ({ ...s, visible: false }))}
              >
                <Text style={styles.modalBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={geminiPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          pendingGeminiRef.current = null;
          setGeminiPromptVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { borderTopLeftRadius: 16, borderTopRightRadius: 16 }]}>
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
              onPress={saveGeminiKeyAndGenerate}
              style={[styles.modalBtn, { backgroundColor: colors.info, marginTop: 8, opacity: geminiInput.trim() ? 1 : 0.65 }]}
              activeOpacity={0.8}
              disabled={!geminiInput.trim()}
            >
              <Text style={[styles.modalBtnText, { color: colors.dark }]}>Save Key</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                pendingGeminiRef.current = null;
                setGeminiPromptVisible(false);
              }}
              style={styles.modalBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={sentenceWordsModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setSentenceWordsModal((s) => ({ ...s, visible: false }))}
      >
        <TouchableOpacity
          style={styles.uiBusyOverlay}
          activeOpacity={1}
          onPress={() => setSentenceWordsModal((s) => ({ ...s, visible: false }))}
        >
          <View style={styles.kanjiListCard}>
            <Text style={styles.modalTitle}>Words in this sentence</Text>
            {sentenceWordsBusy ? (
              <ActivityIndicator size="small" color={colors.info} style={{ marginVertical: 12 }} />
            ) : sentenceWordsModal.words.length === 0 ? (
              <Text style={styles.mutedSmall}>No dictionary words found.</Text>
            ) : (
              sentenceWordsModal.words.map((w) => (
                <TouchableOpacity
                  key={w.word}
                  style={styles.spottedRow}
                  onPress={() => {
                    setSentenceWordsModal((s) => ({ ...s, visible: false }));
                    openDetail('word', w.word).catch(() => {});
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.spottedMain} numberOfLines={1} ellipsizeMode="tail">
                    {w.word}
                    {w.reading ? <Text style={styles.spottedGloss}> ({toRomaji(w.reading)})</Text> : null}
                    {w.meaning.length > 0 ? <Text style={styles.spottedGloss}> — {w.meaning.join(', ')}</Text> : null}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {headerComponent}

        <View
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w && w !== photosWidth) setPhotosWidth(w);
          }}
          {...photosSwipeResponder.panHandlers}
        >
          <Animated.View
            style={{
              flexDirection: 'row',
              width: photosWidth * 2,
              transform: [{ translateX: photosTranslateX }],
            }}
          >
            <View style={{ width: photosWidth }}>
              {renderPhotoGrid(encounterPhotos, 'No encounter photos found.')}
            </View>

            <View style={{ width: photosWidth }}>
              {renderPhotoGrid(practicePhotos, 'No practice photos found.')}
            </View>
          </Animated.View>
        </View>
      </ScrollView>
    </>
  );
}

