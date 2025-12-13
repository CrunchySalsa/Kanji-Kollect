import React from 'react';
import { TouchableOpacity, Image, View, Text } from 'react-native';
import { colors, styles } from '../styles/theme';
import { PhotoEntry } from '../types';

interface PhotoThumbnailProps {
  photo: PhotoEntry;
  onPress: () => void;
  onLongPress: () => void;
  selected?: boolean;
}

export function PhotoThumbnail({ photo, onPress, onLongPress, selected = false }: PhotoThumbnailProps) {
  return (
    <TouchableOpacity style={styles.thumbWrap} onPress={onPress} onLongPress={onLongPress}>
      <View style={{ position: 'relative' }}>
        <Image source={{ uri: photo.uri }} style={[styles.thumb, selected ? { borderWidth: 2, borderColor: colors.accent } : null]} />
        {selected ? (
          <View
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: 'rgba(0,0,0,0.6)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>✓</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

