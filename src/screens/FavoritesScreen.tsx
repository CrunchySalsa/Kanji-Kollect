import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, FlatList, Animated, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles, colors } from '../styles/theme';
import { useAppContext } from '../context/AppContext';
import { useSwipePager } from '../hooks';
import { SegmentedToggle, ListItemRow, EmptyState } from '../components';
import { ListItem, FilterType } from '../types';

const scrollOffsets = { kanji: 0, word: 0 };

function FavoritesScreenImpl() {
  const insets = useSafeAreaInsets();
  const kanjiListRef = useRef<FlatList>(null);
  const wordListRef = useRef<FlatList>(null);
  const restoredRef = useRef({ kanji: false, word: false });
  const restoringRef = useRef({ kanji: false, word: false });

  const {
    favorites,
    metaCache,
    openDetail,
    toggleFavorite,
    items,
  } = useAppContext();

  const [filterType, setFilterType] = useState<FilterType>('kanji');
  const [listWidth, setListWidth] = useState(() => Dimensions.get('window').width);

  const activeIndex = filterType === 'kanji' ? 0 : 1;

  useEffect(() => {
    restoredRef.current = { kanji: false, word: false };
    restoringRef.current = { kanji: false, word: false };
  }, []);

  const restoreScrollIfNeeded = useCallback((which: 'kanji' | 'word') => {
    if (restoredRef.current[which]) return;

    const offset = scrollOffsets[which] ?? 0;
    const ref = which === 'kanji' ? kanjiListRef : wordListRef;
    if (!ref.current) return;

    if (offset <= 0) {
      restoredRef.current[which] = true;
      return;
    }

    restoringRef.current[which] = true;
    requestAnimationFrame(() => {
      ref.current?.scrollToOffset({ offset, animated: false });
      requestAnimationFrame(() => {
        restoringRef.current[which] = false;
        restoredRef.current[which] = true;
      });
    });
  }, []);

  const handleKanjiScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!restoredRef.current.kanji) return;
    if (restoringRef.current.kanji) return;
    scrollOffsets.kanji = e.nativeEvent.contentOffset.y;
  }, []);

  const handleWordScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!restoredRef.current.word) return;
    if (restoringRef.current.word) return;
    scrollOffsets.word = e.nativeEvent.contentOffset.y;
  }, []);

  const handleIndexChange = useCallback((index: number) => {
    const nextType: FilterType = index === 0 ? 'kanji' : 'word';
    setFilterType(nextType);
  }, []);

  const { translateX: listTranslateX, panResponder: swipeResponder } = useSwipePager({
    activeIndex,
    pageCount: 2,
    width: listWidth,
    onIndexChange: handleIndexChange,
  });

  // Convert favorites to ListItems with counts from items
  const favoritesByType = useMemo(() => {
    const kanjiItems: ListItem[] = [];
    const wordItems: ListItem[] = [];

    for (const fav of favorites) {
      // Find matching item in main items list to get counts
      const mainItem = items.find((i) => i.type === fav.type && i.display === fav.id);
      const encounter_count = mainItem?.encounter_count ?? 0;
      const practice_count = mainItem?.practice_count ?? 0;

      if (fav.type === 'kanji') {
        kanjiItems.push({
          type: 'kanji',
          key: `kanji:${fav.id}`,
          display: fav.id,
          encounter_count,
          practice_count,
        });
      } else {
        wordItems.push({
          type: 'word',
          key: `word:${fav.id}`,
          display: fav.id,
          encounter_count,
          practice_count,
          wordAliases: fav.wordAliases,
        });
      }
    }

    return { kanji: kanjiItems, word: wordItems };
  }, [favorites, items]);

  const renderItem = useCallback(
    ({ item, index }: { item: ListItem; index: number }) => {
      const meta = metaCache[`${item.type}:${item.display}`];
      const gloss = meta?.meaning ?? '';

      const handleRemove = async () => {
        await toggleFavorite(item.type, item.display, (item as any).wordAliases);
      };

      return (
        <ListItemRow
          item={item}
          index={index}
          gloss={gloss}
          onPress={() => openDetail(item.type, item.display, (item as any).wordAliases)}
          onHide={handleRemove}
          hideAlertTitle="Remove from favorites"
          hideAlertAction="Remove"
        />
      );
    },
    [metaCache, openDetail, toggleFavorite]
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;

  return (
    <>
      <View style={styles.controls}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Favorites</Text>
        <View style={styles.tabRow}>
          <SegmentedToggle
            options={[
              { key: 'kanji', label: `Kanji (${favoritesByType.kanji.length})` },
              { key: 'word', label: `Words (${favoritesByType.word.length})` },
            ]}
            value={filterType}
            onChange={setFilterType}
          />
        </View>
      </View>

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
              ref={kanjiListRef}
              data={favoritesByType.kanji}
              keyExtractor={(it) => it.key}
              contentContainerStyle={{ paddingBottom: 24 }}
              renderItem={renderItem}
              extraData={metaCache}
              viewabilityConfig={viewabilityConfig}
              onScroll={handleKanjiScroll}
              scrollEventThrottle={16}
              onContentSizeChange={() => restoreScrollIfNeeded('kanji')}
              ListEmptyComponent={<EmptyState message="No favorited kanji yet." />}
            />
          </View>

          <View style={{ width: listWidth, flex: 1 }}>
            <FlatList
              ref={wordListRef}
              data={favoritesByType.word}
              keyExtractor={(it) => it.key}
              contentContainerStyle={{ paddingBottom: 24 }}
              renderItem={renderItem}
              extraData={metaCache}
              viewabilityConfig={viewabilityConfig}
              onScroll={handleWordScroll}
              scrollEventThrottle={16}
              onContentSizeChange={() => restoreScrollIfNeeded('word')}
              ListEmptyComponent={<EmptyState message="No favorited words yet." />}
            />
          </View>
        </Animated.View>
      </View>
    </>
  );
}

export const FavoritesScreen = React.memo(FavoritesScreenImpl);

