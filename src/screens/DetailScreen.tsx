import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, Dimensions } from 'react-native';
import { styles } from '../styles/theme';
import { useAppContext } from '../context/AppContext';
import { useSpeech } from '../hooks';
import { PhotoThumbnail, EmptyState, SegmentedToggle } from '../components';
import { useSwipePager } from '../hooks';
import { GalleryType } from '../types';

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
  } = useAppContext();

  const { speakJa } = useSpeech();

  const [photoType, setPhotoType] = useState<GalleryType>('encounter');
  const [photosWidth, setPhotosWidth] = useState(() => Dimensions.get('window').width);
  const photosActiveIndex = photoType === 'encounter' ? 0 : 1;

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

  const headerComponent = useMemo(() => {
    if (!detail) return null;
    return (
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

        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <SegmentedToggle
            options={[
              { key: 'encounter', label: 'Encounters' },
              { key: 'practice', label: 'Practice' },
            ]}
            value={photoType}
            onChange={setPhotoType}
          />
        </View>
      </View>
    );
  }, [detail, detailKanjiInfo, detailWordInfo, detailWordsSpotted, metaCache, openDetail, photoType, setWordKanjiModal, speakJa, uniqueReadings]);

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
  );
}

