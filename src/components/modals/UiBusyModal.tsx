import React from 'react';
import { View, Text, Modal, ActivityIndicator } from 'react-native';
import { styles, colors } from '../../styles/theme';

interface UiBusyModalProps {
  visible: boolean;
  label: string;
}

export function UiBusyModal({ visible, label }: UiBusyModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.uiBusyOverlay}>
        <View style={styles.uiBusyCard}>
          <ActivityIndicator size="large" color={colors.text} />
          <Text style={styles.uiBusyText}>{label}</Text>
        </View>
      </View>
    </Modal>
  );
}

