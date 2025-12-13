import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, Animated, Dimensions } from 'react-native';
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
    onDeletePhoto,
  } = useAppContext();

  const [galleryWidth, setGalleryWidth] = useState(() => Dimensions.get('window').width);

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

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailTitle}>Gallery</Text>
        <Text style={styles.mutedSmall}>Tap to view. Long-press to delete.</Text>
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
                      onPress={() => openFullImage(item)}
                      onLongPress={() => onDeletePhoto(item)}
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
                      onPress={() => openFullImage(item)}
                      onLongPress={() => onDeletePhoto(item)}
                    />
                  )}
                />
              )}
            </View>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

