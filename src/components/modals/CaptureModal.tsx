import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { styles } from '../../styles/theme';
import { CaptureModalState, PhotoType } from '../../types';

interface CaptureModalProps {
  state: CaptureModalState;
  onClose: () => void;
  onCamera: (photoType: PhotoType) => void;
  onGallery: (photoType: PhotoType) => void;
}

export function CaptureModal({ state, onClose, onCamera, onGallery }: CaptureModalProps) {
  return (
    <Modal visible={state.visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {state.photoType === 'encounter' ? 'New Encounter' : 'Add Practice'}
          </Text>
          <TouchableOpacity
            style={styles.modalBtn}
            onPress={() => {
              const t = state.photoType;
              onClose();
              if (t) onCamera(t);
            }}
          >
            <Text style={styles.modalBtnText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.modalBtn}
            onPress={() => {
              const t = state.photoType;
              onClose();
              if (t) onGallery(t);
            }}
          >
            <Text style={styles.modalBtnText}>Choose from Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={onClose}>
            <Text style={styles.modalBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

