import React from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, TouchableWithoutFeedback } from 'react-native';
import { styles } from '../../styles/theme';
import { EditModalState } from '../../types';

interface EditModalProps {
  state: EditModalState;
  onClose: () => void;
  onSave: () => void;
  onChangeKanji: (text: string) => void;
  onChangeWords: (text: string) => void;
}

export function EditModal({ state, onClose, onSave, onChangeKanji, onChangeWords }: EditModalProps) {
  return (
    <Modal visible={state.visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableWithoutFeedback>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Extracted Text</Text>
            <Text style={styles.mutedSmall}>Kanji (characters, duplicates allowed):</Text>
            <TextInput
              style={styles.search}
              placeholder="e.g. 公園禁止"
              placeholderTextColor="#666"
              value={state.kanjiText}
              onChangeText={onChangeKanji}
            />
            <Text style={styles.mutedSmall}>Words (separate with 、 or spaces):</Text>
            <TextInput
              style={styles.search}
              placeholder="e.g. 立入禁止、公園"
              placeholderTextColor="#666"
              value={state.wordsText}
              onChangeText={onChangeWords}
            />
            <TouchableOpacity style={styles.modalBtn} onPress={onSave}>
              <Text style={styles.modalBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={onClose}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>
  );
}

