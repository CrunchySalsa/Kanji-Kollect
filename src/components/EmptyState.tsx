import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { styles, colors } from '../styles/theme';

interface EmptyStateProps {
  loading?: boolean;
  message: string;
}

export function EmptyState({ loading, message }: EmptyStateProps) {
  return (
    <View style={styles.center}>
      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} />
      ) : (
        <Text style={styles.muted}>{message}</Text>
      )}
    </View>
  );
}

