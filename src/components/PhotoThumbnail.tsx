import React from 'react';
import { TouchableOpacity, Image } from 'react-native';
import { styles } from '../styles/theme';
import { PhotoEntry } from '../types';

interface PhotoThumbnailProps {
  photo: PhotoEntry;
  onPress: () => void;
  onLongPress: () => void;
}

export function PhotoThumbnail({ photo, onPress, onLongPress }: PhotoThumbnailProps) {
  return (
    <TouchableOpacity style={styles.thumbWrap} onPress={onPress} onLongPress={onLongPress}>
      <Image source={{ uri: photo.uri }} style={styles.thumb} />
    </TouchableOpacity>
  );
}

