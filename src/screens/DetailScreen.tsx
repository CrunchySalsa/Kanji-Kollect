import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { styles } from '../styles/theme';
import { useAppContext } from '../context/AppContext';
import { useSpeech } from '../hooks';
import { PhotoThumbnail, EmptyState } from '../components';

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
    );
  }, [detail, detailKanjiInfo, detailWordInfo, detailWordsSpotted, detailPhotos, metaCache, openDetail, setWordKanjiModal, speakJa, uniqueReadings]);

  const footerComponent = useMemo(() => (
    <Text style={styles.mutedSmallCenter}>Long-press a thumbnail to delete the photo.</Text>
  ), []);

  if (!detail) {
    return <EmptyState message="No detail selected." />;
  }

  if (detailPhotos.length === 0 && !detailLoading) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        {headerComponent}
        <EmptyState loading={detailLoading} message="No photos found." />
        {footerComponent}
      </ScrollView>
    );
  }

  return (
    <FlatList
      data={detailPhotos}
      keyExtractor={(p) => String(p.id)}
      numColumns={3}
      contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
      ListHeaderComponent={headerComponent}
      ListFooterComponent={footerComponent}
      ListEmptyComponent={<EmptyState loading={detailLoading} message="No photos found." />}
      renderItem={({ item }) => (
        <PhotoThumbnail
          photo={item}
          onPress={() => openFullImage(item)}
          onLongPress={() => onDeletePhoto(item)}
        />
      )}
    />
  );
}

