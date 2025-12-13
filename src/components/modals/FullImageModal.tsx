import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Image, Animated } from 'react-native';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { styles } from '../../styles/theme';
import { PhotoEntry, FullImageMeta, MetaCacheEntry } from '../../types';
import { SegmentedToggle } from '../SegmentedToggle';
import { useSwipePager } from '../../hooks';

interface FullImageModalProps {
  photo: PhotoEntry | null;
  meta: FullImageMeta | null;
  metaCache: Record<string, MetaCacheEntry>;
  menuVisible: boolean;
  reprocessBusy: boolean;
  menuTab: 'kanji' | 'word';
  onMenuTabChange: (t: 'kanji' | 'word') => void;
  scrollY: { kanji: number; word: number };
  onScrollYChange: React.Dispatch<React.SetStateAction<{ kanji: number; word: number }>>;
  onClose: () => void;
  onToggleMenu: () => void;
  onReprocess: () => void;
  onApplyEdits: (next: { kanji: string[]; words: string[] }) => void;
  onOpenKanji: (k: string) => void;
  onOpenWord: (w: string) => void;
  onDelete: () => void;
}

export function FullImageModal({
  photo,
  meta,
  metaCache,
  menuVisible,
  reprocessBusy,
  menuTab,
  onMenuTabChange,
  scrollY,
  onScrollYChange,
  onClose,
  onToggleMenu,
  onReprocess,
  onApplyEdits,
  onOpenKanji,
  onOpenWord,
  onDelete,
}: FullImageModalProps) {
  const [editMode, setEditMode] = useState(false);
  const [draftKanji, setDraftKanji] = useState<string[]>([]);
  const [draftWords, setDraftWords] = useState<string[]>([]);

  const [tokenEditorVisible, setTokenEditorVisible] = useState(false);
  const [tokenKind, setTokenKind] = useState<'kanji' | 'word'>('kanji');
  const [tokenIndex, setTokenIndex] = useState(0);
  const [tokenValue, setTokenValue] = useState('');

  const kanjiScrollRef = useRef<ScrollView | null>(null);
  const wordScrollRef = useRef<ScrollView | null>(null);
  const zoomableViewRef = useRef<ReactNativeZoomableView | null>(null);

  // Track scroll positions in refs to avoid re-renders during scroll
  const kanjiScrollYRef = useRef(scrollY.kanji);
  const wordScrollYRef = useRef(scrollY.word);
  const lastPhotoIdRef = useRef<number | null>(null);
  const prevMenuVisibleRef = useRef(false);

  useEffect(() => {
    const prevMenuVisible = prevMenuVisibleRef.current;
    prevMenuVisibleRef.current = menuVisible;

    // If the menu just closed, persist the last known scroll positions.
    if (prevMenuVisible && !menuVisible) {
      onScrollYChange({ kanji: kanjiScrollYRef.current, word: wordScrollYRef.current });
    }
  }, [menuVisible, onScrollYChange]);

  useEffect(() => {
    // Reset zoom when opening a different image.
    zoomableViewRef.current?.zoomTo(1);
  }, [photo?.id]);

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
    setTokenValue('');
  }, [photo?.id, menuVisible]);

  useEffect(() => {
    if (!menuVisible) return;
    // Restore scroll positions on open (and after Back-restore).
    kanjiScrollYRef.current = scrollY.kanji;
    wordScrollYRef.current = scrollY.word;
    requestAnimationFrame(() => {
      try {
        kanjiScrollRef.current?.scrollTo({ y: kanjiScrollYRef.current, animated: false });
        wordScrollRef.current?.scrollTo({ y: wordScrollYRef.current, animated: false });
      } catch {}
    });
  }, [menuVisible, photo?.id, scrollY.kanji, scrollY.word]);

  useEffect(() => {
    if (!editMode) return;
    setDraftKanji(meta?.kanji ? [...meta.kanji] : []);
    setDraftWords(meta?.words ? [...meta.words] : []);
  }, [editMode, meta?.kanji, meta?.words]);

  const displayKanji = editMode ? draftKanji : meta?.kanji ?? [];
  const displayWords = editMode ? draftWords : meta?.words ?? [];

  const wordRows = useMemo(() => {
    return displayWords.map((w) => {
      const gloss = metaCache[`word:${w}`]?.meaning ?? '';
      return { w, gloss };
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

  return (
    <Modal visible={!!photo} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fullOverlay}>
        <ReactNativeZoomableView
          ref={zoomableViewRef}
          maxZoom={4}
          minZoom={1}
          zoomStep={0.5}
          initialZoom={1}
          bindToBorders={true}
          onSingleTap={handleSingleTap}
          style={styles.fullTapZone}
          contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }}
        >
          {photo && (
            <Image
              source={{ uri: photo.uri }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </ReactNativeZoomableView>

        <TouchableOpacity style={styles.fullClose} onPress={onClose}>
          <Text style={styles.fullCloseText}>✕</Text>
        </TouchableOpacity>

        {menuVisible && photo && (
          <View style={styles.fullMenu}>
            <TouchableOpacity
              style={[styles.modalBtn, { paddingVertical: 10, opacity: reprocessBusy ? 0.7 : 1 }]}
              onPress={onReprocess}
              disabled={reprocessBusy}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {reprocessBusy ? <ActivityIndicator size="small" color="#e8e8e8" /> : null}
                <Text style={styles.modalBtnText}>{reprocessBusy ? 'Reprocessing…' : '↻ Reprocess'}</Text>
              </View>
            </TouchableOpacity>

            {!editMode ? (
              <TouchableOpacity style={styles.modalBtn} onPress={() => setEditMode(true)}>
                <Text style={styles.modalBtnText}>Edit Extracted Text</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.modalBtn} onPress={handleSaveEdits}>
                  <Text style={styles.modalBtnText}>Save Changes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={() => setEditMode(false)}>
                  <Text style={styles.modalBtnText}>Cancel Editing</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={{ flexDirection: 'row', marginTop: 2 }}>
              <SegmentedToggle
                options={[
                  { key: 'kanji', label: 'Kanji' },
                  { key: 'word', label: 'Words' },
                ]}
                value={menuTab}
                onChange={onMenuTabChange}
              />
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
                        onScroll={(e) => {
                          kanjiScrollYRef.current = e.nativeEvent.contentOffset.y;
                        }}
                        scrollEventThrottle={100}
                        onMomentumScrollEnd={() => onScrollYChange({ kanji: kanjiScrollYRef.current, word: wordScrollYRef.current })}
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
                                <Text style={styles.spottedMain} numberOfLines={1} ellipsizeMode="tail">
                                  {k}
                                  {meaning ? <Text style={styles.spottedGloss}> — {meaning}</Text> : null}
                                </Text>
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
                        onScroll={(e) => {
                          wordScrollYRef.current = e.nativeEvent.contentOffset.y;
                        }}
                        scrollEventThrottle={100}
                        onMomentumScrollEnd={() => onScrollYChange({ kanji: kanjiScrollYRef.current, word: wordScrollYRef.current })}
                      >
                        {wordRows.length ? (
                          <View style={{ marginTop: 10 }}>
                            {wordRows.map(({ w, gloss }, idx) => (
                              <TouchableOpacity
                                key={`${w}-${idx}`}
                                style={styles.spottedRow}
                                onPress={() => (editMode ? openTokenEditor('word', idx, w) : handlePressWordRow(w))}
                                activeOpacity={0.85}
                              >
                                <Text style={styles.spottedMain} numberOfLines={1} ellipsizeMode="tail">
                                  {w}
                                  {gloss ? <Text style={styles.spottedGloss}> — {gloss}</Text> : null}
                                </Text>
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
          <View style={styles.modalOverlay}>
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
          </View>
        </Modal>
      </View>
    </Modal>
  );
}
