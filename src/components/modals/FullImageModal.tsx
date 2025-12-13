import React from 'react';
import { View, Text, Modal, TouchableOpacity, Image } from 'react-native';
import { styles } from '../../styles/theme';
import { PhotoEntry, FullImageMeta } from '../../types';

interface FullImageModalProps {
  photo: PhotoEntry | null;
  meta: FullImageMeta | null;
  menuVisible: boolean;
  onClose: () => void;
  onToggleMenu: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function FullImageModal({
  photo,
  meta,
  menuVisible,
  onClose,
  onToggleMenu,
  onEdit,
  onDelete,
}: FullImageModalProps) {
  return (
    <Modal visible={!!photo} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fullOverlay}>
        <TouchableOpacity style={styles.fullTapZone} activeOpacity={1} onPress={onToggleMenu}>
          {photo && <Image source={{ uri: photo.uri }} style={styles.fullImage} resizeMode="contain" />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.fullClose} onPress={onClose}>
          <Text style={styles.fullCloseText}>✕</Text>
        </TouchableOpacity>

        {menuVisible && photo && (
          <View style={styles.fullMenu}>
            <Text style={styles.fullMenuTitle}>{photo.type === 'encounter' ? 'Encounter' : 'Practice'}</Text>
            <Text style={styles.mutedSmall}>
              Kanji: {meta?.kanji?.length ? meta.kanji.join(' ') : 'None'}
            </Text>
            <Text style={styles.mutedSmall}>
              Words: {meta?.words?.length ? meta.words.join('、 ') : 'None'}
            </Text>
            <TouchableOpacity style={styles.modalBtn} onPress={onEdit}>
              <Text style={styles.modalBtnText}>Edit Extracted Text</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, styles.modalDanger]} onPress={onDelete}>
              <Text style={styles.modalBtnText}>Delete Photo</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

