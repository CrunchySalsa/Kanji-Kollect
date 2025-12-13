import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { styles, colors } from '../styles/theme';

export function LoadingSpinner() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}

