import React, { useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Animated, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles, colors } from '../styles/theme';
import { useAppContext } from '../context/AppContext';
import { useSwipePager } from '../hooks';
import { Dropdown, SegmentedToggle, ListItemRow, EmptyState } from '../components';
import { SortMethod, FilterType, ListItem } from '../types';
import { hideKanji, hideWord } from '../../services/database';

export function ListScreen() {
  const insets = useSafeAreaInsets();
  const searchInputRef = useRef<any>(null);
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
    openDetail,
    reloadList,
    setCaptureModal,
  } = useAppContext();

  const [listWidth, setListWidth] = useState(() => Dimensions.get('window').width);

  const activeIndex = filterType === 'kanji' ? 0 : 1;

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

  const sortValueLabel = `${sortMethod === 'gap' ? 'Score' : sortMethod === 'encountered' ? 'Seen' : 'Practiced'} ${sortDir === 'desc' ? '▼' : '▲'}`;

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
                { key: 'gap', label: 'Score' },
                { key: 'encountered', label: 'Seen' },
                { key: 'practiced', label: 'Practiced' },
              ]}
              onSelect={handleSortSelect}
            />
          </View>
        </View>
      </View>

      {loading ? (
        <EmptyState loading message="" />
      ) : normalizedQuery ? (
        <FlatList
          data={combinedSearchResults}
          keyExtractor={(it) => it.key}
          contentContainerStyle={{ paddingBottom: 96 }}
          renderItem={renderItem}
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
                data={filteredSortedByType.kanji}
                keyExtractor={(it) => it.key}
                contentContainerStyle={{ paddingBottom: 96 }}
                renderItem={renderItem}
                ListEmptyComponent={<EmptyState message="No data yet. Add an encounter or practice photo." />}
              />
            </View>

            <View style={{ width: listWidth, flex: 1 }}>
              <FlatList
                data={filteredSortedByType.word}
                keyExtractor={(it) => it.key}
                contentContainerStyle={{ paddingBottom: 96 }}
                renderItem={renderItem}
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

