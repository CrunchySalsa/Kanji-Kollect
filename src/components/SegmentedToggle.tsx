import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '../styles/theme';

interface SegmentedToggleProps<T extends string> {
  options: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedToggle<T extends string>({ options, value, onChange }: SegmentedToggleProps<T>) {
  return (
    <View style={styles.tabPill}>
      {options.map((option) => (
        <TouchableOpacity
          key={option.key}
          style={[styles.tabBtn, value === option.key && styles.tabBtnActive]}
          onPress={() => onChange(option.key)}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, value === option.key && styles.tabTextActive]}>{option.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

