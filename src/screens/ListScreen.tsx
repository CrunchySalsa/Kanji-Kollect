import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Animated, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles, colors } from '../styles/theme';
import { useListContext } from '../context';
import { useSwipePager } from '../hooks';
import { Dropdown, SegmentedToggle, ListItemRow, EmptyState } from '../components';
import { SortMethod, FilterType, ListItem } from '../types';
import { hideKanji, hideWord } from '../../services/database';

// Store scroll positions outside component to persist across screen changes
const scrollOffsets = { kanji: 0, word: 0, search: 0 };

function ListScreenImpl() {
  const insets = useSafeAreaInsets();
  const searchInputRef = useRef<any>(null);
  const kanjiListRef = useRef<FlatList>(null);
  const wordListRef = useRef<FlatList>(null);
  const searchListRef = useRef<FlatList>(null);
  const restoredRef = useRef({ kanji: false, word: false, search: false });
  const restoringRef = useRef({ kanji: false, word: false, search: false });
  const {
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
  } = useListContext();

  const [listWidth, setListWidth] = useState(() => Dimensions.get('window').width);

  const activeIndex = filterType === 'kanji' ? 0 : 1;

  // Reset restore flags each time ListScreen mounts (it is conditionally rendered by MainScreen)
  useEffect(() => {
    restoredRef.current = { kanji: false, word: false, search: false };
    restoringRef.current = { kanji: false, word: false, search: false };
  }, []);

  const restoreScrollIfNeeded = useCallback(
    (which: 'kanji' | 'word' | 'search') => {
      if (restoredRef.current[which]) return;

      // Only restore the list that is currently rendered
      if (normalizedQuery) {
        if (which !== 'search') return;
      } else {
        if (which === 'search') return;
      }

      const offset = scrollOffsets[which] ?? 0;
      const ref = which === 'kanji' ? kanjiListRef : which === 'word' ? wordListRef : searchListRef;
      if (!ref.current) return;

      // Nothing meaningful to restore
      if (offset <= 0) {
        restoredRef.current[which] = true;
        return;
      }

      restoringRef.current[which] = true;
      requestAnimationFrame(() => {
        ref.current?.scrollToOffset({ offset, animated: false });
        // Allow one frame for the offset to apply before capturing scroll events
        requestAnimationFrame(() => {
          restoringRef.current[which] = false;
          restoredRef.current[which] = true;
        });
      });
    },
    [normalizedQuery]
  );

  const handleKanjiScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Do not overwrite the saved offset until we've attempted a restore for this mount.
    if (!restoredRef.current.kanji) return;
    if (restoringRef.current.kanji) return;
    scrollOffsets.kanji = e.nativeEvent.contentOffset.y;
  }, []);

  const handleWordScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!restoredRef.current.word) return;
    if (restoringRef.current.word) return;
    scrollOffsets.word = e.nativeEvent.contentOffset.y;
  }, []);

  const handleSearchScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!restoredRef.current.search) return;
    if (restoringRef.current.search) return;
    scrollOffsets.search = e.nativeEvent.contentOffset.y;
  }, []);

  const handleIndexChange = useCallback(
    (index: number) => {
      const nextType: FilterType = index === 0 ? 'kanji' : 'word';
      setFilterTypeAndPersist(nextType);
    },
    [setFilterTypeAndPersist]
  );

  const { translateX: listTranslateX, panResponder: swipeResponder } = useSwipePager({
    activeIndex,
    pageCount: 2,
    width: listWidth,
    onIndexChange: handleIndexChange,
  });

  const handleSortSelect = useCallback(
    (key: string) => {
      const next = key as SortMethod;
      if (next === sortMethod) {
        setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
      } else {
        setSortMethod(next);
        setSortDir('desc');
      }
    },
    [sortMethod, sortDir, setSortMethod, setSortDir]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ListItem; index: number }) => {
      const meta = metaCache[`${item.type}:${item.display}`];
      const gloss = meta?.meaning ?? '';

      const handleHide = async () => {
        if (item.type === 'kanji') {
          await hideKanji(item.display);
        } else {
          const aliases = (item as any).wordAliases?.length ? (item as any).wordAliases : [item.display];
          await Promise.all(aliases.map((w: string) => hideWord(w)));
        }
        await reloadList();
      };

      return (
        <ListItemRow
          item={item}
          index={index}
          gloss={gloss}
          onPress={() => openDetail(item.type, item.display, (item as any).wordAliases)}
          onHide={handleHide}
        />
      );
    },
    [metaCache, openDetail, reloadList]
  );

  const onViewableKanjiItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    const idxs = viewableItems.map((v) => v.index).filter((n): n is number => typeof n === 'number');
    if (!idxs.length) return;
    setListViewportStart('kanji', Math.min(...idxs));
  }).current;

  const onViewableWordItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    const idxs = viewableItems.map((v) => v.index).filter((n): n is number => typeof n === 'number');
    if (!idxs.length) return;
    setListViewportStart('word', Math.min(...idxs));
  }).current;

  const onViewableSearchItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    const idxs = viewableItems.map((v) => v.index).filter((n): n is number => typeof n === 'number');
    if (!idxs.length) return;
    setListViewportStart('search', Math.min(...idxs));
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;

  const sortName =
    sortMethod === 'encountered'
      ? 'Seen'
      : sortMethod === 'practiced'
        ? 'Practiced'
        : sortMethod === 'mastery'
          ? 'Mastery'
          : 'Priority';
  const sortValueLabel = `${sortName} ${sortDir === 'desc' ? '▼' : '▲'}`;

  return (
    <>
      <View style={styles.controls}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search…"
            placeholderTextColor={colors.textSearch}
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
          <SegmentedToggle
            options={[
              { key: 'kanji', label: 'Kanji' },
              { key: 'word', label: 'Words' },
            ]}
            value={filterType}
            onChange={setFilterTypeAndPersist}
          />

          <View style={styles.sortBox}>
            <Dropdown
              label="Sort"
              valueLabel={sortValueLabel}
              options={[
                { key: 'priority', label: 'Priority' },
                { key: 'mastery', label: 'Mastery' },
                { key: 'encountered', label: 'Seen' },
                { key: 'practiced', label: 'Practiced' },
              ]}
              onSelect={handleSortSelect}
            />
          </View>
        </View>
      </View>

      {loading ? (
        // Allow bottom buttons to remain tappable even during initial load.
        <View style={{ flex: 1 }} pointerEvents="none">
          <EmptyState loading message="" />
        </View>
      ) : normalizedQuery ? (
        <FlatList
          ref={searchListRef}
          data={combinedSearchResults}
          keyExtractor={(it) => it.key}
          contentContainerStyle={{ paddingBottom: 96 }}
          renderItem={renderItem}
          extraData={metaCache}
          onViewableItemsChanged={onViewableSearchItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onScroll={handleSearchScroll}
          scrollEventThrottle={16}
          onContentSizeChange={() => restoreScrollIfNeeded('search')}
          ListEmptyComponent={<EmptyState message="No results found." />}
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
                ref={kanjiListRef}
                data={filteredSortedByType.kanji}
                keyExtractor={(it) => it.key}
                contentContainerStyle={{ paddingBottom: 96 }}
                renderItem={renderItem}
                extraData={metaCache}
                onViewableItemsChanged={onViewableKanjiItemsChanged}
                viewabilityConfig={viewabilityConfig}
                onScroll={handleKanjiScroll}
                scrollEventThrottle={16}
                onContentSizeChange={() => restoreScrollIfNeeded('kanji')}
                ListEmptyComponent={<EmptyState message="No data yet. Add an encounter or practice photo." />}
              />
            </View>

            <View style={{ width: listWidth, flex: 1 }}>
              <FlatList
                ref={wordListRef}
                data={filteredSortedByType.word}
                keyExtractor={(it) => it.key}
                contentContainerStyle={{ paddingBottom: 96 }}
                renderItem={renderItem}
                extraData={metaCache}
                onViewableItemsChanged={onViewableWordItemsChanged}
                viewabilityConfig={viewabilityConfig}
                onScroll={handleWordScroll}
                scrollEventThrottle={16}
                onContentSizeChange={() => restoreScrollIfNeeded('word')}
                ListEmptyComponent={<EmptyState message="No data yet. Add an encounter or practice photo." />}
              />
            </View>
          </Animated.View>
        </View>
      )}

      <View style={[styles.bottomBar, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <TouchableOpacity
          style={[styles.bottomBtn, styles.encBtn]}
          onPress={() => setCaptureModal({ visible: true, photoType: 'encounter' })}
        >
          <Text style={styles.bottomBtnText}>New Encounter</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomBtn, styles.pracBtn]}
          onPress={() => setCaptureModal({ visible: true, photoType: 'practice' })}
        >
          <Text style={styles.bottomBtnText}>Add Practice</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

export const ListScreen = React.memo(ListScreenImpl);

