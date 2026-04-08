import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, Dimensions, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { styles, colors } from '../styles/theme';
import { useAppContext } from '../context/AppContext';
import { useSpeech } from '../hooks';
import { PhotoThumbnail, EmptyState, SegmentedToggle } from '../components';
import { useSwipePager } from '../hooks';
import { GalleryType } from '../types';
import { getPreference, setPreference } from '../../utils/preferences';
import { generateExampleSentence, ExampleSentenceError, ExampleSentenceResult } from '../../services/exampleSentence';
import { tokenizeSentenceWords, WordInfo } from '../../services/dictionary';
import { toRomaji } from 'wanakana';

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
  } = useAppContext();

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

  const saveGeminiKeyAndGenerate = useCallback(async () => {
    const trimmed = geminiInput.trim();
    if (!trimmed) return;
    await setGeminiApiKey(trimmed);
    setGeminiPromptVisible(false);
    setShowGeminiKey(false);
    await createExample(trimmed);
  }, [createExample, geminiInput, setGeminiApiKey]);

  const onPressCreateExample = useCallback(() => {
    if (!geminiApiKey) {
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
            <Text key={`hl-${keyIndex++}`} style={{ backgroundColor: 'rgba(96,165,250,0.18)', borderRadius: 3, fontWeight: '700' }}>
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
        {sentenceLines.map((line, index) => (
          <View key={`example-line-${index}`} style={{ flexDirection: 'row', marginTop: index > 0 ? 6 : 0 }}>
            <Text style={[styles.detailInfoValue, { marginRight: 8 }]}>-</Text>
            <View style={{ flex: 1 }}>
              {index === 0 ? (
                <TouchableOpacity onPress={() => onPressSentenceLine(line)} activeOpacity={0.7} disabled={sentenceWordsBusy}>
                  {renderHighlightedText(line, [styles.detailInfoValue, { lineHeight: 20, color: colors.info }])}
                </TouchableOpacity>
              ) : (
                renderHighlightedText(line, [styles.detailInfoValue, { lineHeight: 20 }])
              )}
            </View>
          </View>
        ))}
      </>
    );
  }, [renderHighlightedText, onPressSentenceLine, sentenceWordsBusy]);

  const headerComponent = useMemo(() => {
    if (!detail) return null;
    return (
      <View style={styles.detailHeader}>
        {detail.type === 'word' ? (
          (() => {
            const hasKanji = /[\u4e00-\u9faf]/.test(detail.id);
            const titleContent = (
              <Text style={styles.detailTitle}>
                {detail.id}
                {detailWordRomaji ? <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textMuted }}> ({detailWordRomaji})</Text> : null}
              </Text>
            );
            return hasKanji ? (
              <TouchableOpacity onPress={() => setWordKanjiModal((s) => ({ ...s, visible: true }))} activeOpacity={0.8}>
                {titleContent}
              </TouchableOpacity>
            ) : titleContent;
          })()
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
            onLongPress={() => onDeletePhoto(item)}
          />
        ))}
      </View>
    );
  };

  return (
    <>
      <Modal visible={geminiPromptVisible} transparent animationType="fade" onRequestClose={() => setGeminiPromptVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { borderTopLeftRadius: 16, borderTopRightRadius: 16 }]}>
            <Text style={styles.modalTitle}>Gemini API Key Required</Text>
            <Text style={[styles.mutedSmall, { marginBottom: 8 }]}>
              Enter your Gemini API key to generate example sentences.
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
            <TouchableOpacity onPress={() => setGeminiPromptVisible(false)} style={styles.modalBtn} activeOpacity={0.8}>
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

