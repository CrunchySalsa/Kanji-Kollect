import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Animated, Dimensions, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { styles } from '../styles/theme';
import { useAppContext } from '../context/AppContext';
import { useSwipePager } from '../hooks';
import { SegmentedToggle, PhotoThumbnail, EmptyState } from '../components';
import { GalleryType } from '../types';

export function GalleryScreen() {
  const {
    galleryType,
    setGalleryType,
    allPhotos,
    galleryLoading,
    openFullImage,
    deletePhotos,
    captureFromCamera,
    pickFromGallery,
  } = useAppContext();

  const [galleryWidth, setGalleryWidth] = useState(() => Dimensions.get('window').width);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [fabMenuOpen, setFabMenuOpen] = useState(false);

  const activeColor = galleryType === 'encounter' ? styles.encBtn.backgroundColor : styles.pracBtn.backgroundColor;
  const fabBg = `${activeColor}CC`; // 80% opacity
  const fabMenuItemBg = `${activeColor}CC`;
  const fabMenuBorder = `${activeColor}88`;

  const selectionActive = selectedIds.size > 0;

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const galleryActiveIndex = galleryType === 'encounter' ? 0 : 1;

  const handleIndexChange = useCallback(
    (index: number) => {
      const nextType: GalleryType = index === 0 ? 'encounter' : 'practice';
      setGalleryType(nextType);
    },
    [setGalleryType]
  );

  const { translateX: galleryTranslateX, panResponder: gallerySwipeResponder } = useSwipePager({
    activeIndex: galleryActiveIndex,
    pageCount: 2,
    width: galleryWidth,
    onIndexChange: handleIndexChange,
  });

  const encounterPhotos = allPhotos.filter((p) => p.type === 'encounter');
  const practicePhotos = allPhotos.filter((p) => p.type === 'practice');

  const selectedPhotos = useMemo(() => {
    if (!selectedIds.size) return [];
    return allPhotos.filter((p) => selectedIds.has(p.id));
  }, [allPhotos, selectedIds]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedPhotos.length) return;
    const count = selectedPhotos.length;
    Alert.alert('Delete photos', `Delete ${count} photo${count === 1 ? '' : 's'} and update counts?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePhotos(selectedPhotos);
          clearSelection();
        },
      },
    ]);
  }, [clearSelection, deletePhotos, selectedPhotos]);

  const handleFabCamera = useCallback(() => {
    setFabMenuOpen(false);
    captureFromCamera(galleryType);
  }, [captureFromCamera, galleryType]);

  const handleFabGallery = useCallback(() => {
    setFabMenuOpen(false);
    pickFromGallery(galleryType);
  }, [galleryType, pickFromGallery]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailTitle}>Gallery</Text>
        <Text style={styles.mutedSmall}>{selectionActive ? `Selected: ${selectedIds.size}` : 'Tap to view. Long-press to select.'}</Text>
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          <SegmentedToggle
            options={[
              { key: 'encounter', label: 'Encounters' },
              { key: 'practice', label: 'Practice' },
            ]}
            value={galleryType}
            onChange={setGalleryType}
          />
        </View>

        {selectionActive ? (
          <View style={{ flexDirection: 'row', marginTop: 10, gap: 10 }}>
            <TouchableOpacity style={[styles.modalBtn, styles.modalCancel, { flex: 1 }]} onPress={clearSelection}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, styles.modalDanger, { flex: 1 }]} onPress={handleDeleteSelected}>
              <Text style={styles.modalBtnText}>Delete ({selectedIds.size})</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {galleryLoading ? (
        <EmptyState loading message="" />
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
              {encounterPhotos.length === 0 ? (
                <EmptyState message="No encounter photos yet." />
              ) : (
                <FlatList
                  data={encounterPhotos}
                  keyExtractor={(p) => String(p.id)}
                  numColumns={3}
                  contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
                  renderItem={({ item }) => (
                    <PhotoThumbnail
                      photo={item}
                      selected={selectedIds.has(item.id)}
                    onPress={() =>
                      selectionActive ? toggleSelected(item.id) : openFullImage(item, { photos: encounterPhotos })
                    }
                      onLongPress={() => toggleSelected(item.id)}
                    />
                  )}
                />
              )}
            </View>

            <View style={{ width: galleryWidth, flex: 1 }}>
              {practicePhotos.length === 0 ? (
                <EmptyState message="No practice photos yet." />
              ) : (
                <FlatList
                  data={practicePhotos}
                  keyExtractor={(p) => String(p.id)}
                  numColumns={3}
                  contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
                  renderItem={({ item }) => (
                    <PhotoThumbnail
                      photo={item}
                      selected={selectedIds.has(item.id)}
                    onPress={() =>
                      selectionActive ? toggleSelected(item.id) : openFullImage(item, { photos: practicePhotos })
                    }
                      onLongPress={() => toggleSelected(item.id)}
                    />
                  )}
                />
              )}
            </View>
          </Animated.View>
        </View>
      )}

      {fabMenuOpen ? (
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={() => setFabMenuOpen(false)}
        />
      ) : null}

      <View style={styles.fabContainer} pointerEvents="box-none">
        {fabMenuOpen ? (
          <View style={[styles.fabMenu, { backgroundColor: `${fabMenuItemBg}22`, borderColor: fabMenuBorder }]}>
            <TouchableOpacity style={[styles.fabMenuItem, { backgroundColor: fabMenuItemBg }]} onPress={handleFabCamera} activeOpacity={0.85}>
              <Text style={[styles.fabMenuItemText, { color: styles.bottomBtnText.color }]}>Add from camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.fabMenuItem, { backgroundColor: fabMenuItemBg }]} onPress={handleFabGallery} activeOpacity={0.85}>
              <Text style={[styles.fabMenuItemText, { color: styles.bottomBtnText.color }]}>Choose from gallery</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.fab, { backgroundColor: fabBg }]}
          onPress={() => setFabMenuOpen((v) => !v)}
          activeOpacity={0.85}
          accessibilityLabel="Add photo"
        >
          <Text style={styles.fabIcon}>＋</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

