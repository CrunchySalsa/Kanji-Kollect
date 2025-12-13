import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { styles, colors } from '../styles/theme';
import { ListItem, ItemType } from '../types';
import { hideKanji, hideWord } from '../../services/database';

interface ListItemRowProps {
  item: ListItem;
  index: number;
  gloss: string;
  onPress: () => void;
  onHide: () => Promise<void>;
}

export function ListItemRow({ item, index, gloss, onPress, onHide }: ListItemRowProps) {
  const warn = item.encounter_count > 0 && item.practice_count === 0;

  const practicePct = item.encounter_count > 0 ? (item.practice_count / item.encounter_count) * 100 : null;
  const edgeColor =
    practicePct === null
      ? null
      : practicePct === 0
        ? colors.accent
        : practicePct <= 50
          ? colors.warningOrange
          : practicePct <= 74
            ? colors.warningYellow
            : colors.success;
  const edgeStyle = edgeColor ? ({ borderLeftWidth: 4, borderLeftColor: edgeColor } as const) : null;

  const handleLongPress = () => {
    Alert.alert('Hide item', `Hide ${item.display}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Hide',
        style: 'destructive',
        onPress: onHide,
      },
    ]);
  };

  return (
    <TouchableOpacity
      style={[styles.listRow, edgeStyle]}
      onPress={onPress}
      onLongPress={handleLongPress}
    >
      <Text style={styles.rank}>{index + 1}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemText} numberOfLines={1} ellipsizeMode="tail">
          {item.display}
          {gloss ? <Text style={styles.itemGloss}> — {gloss}</Text> : null}
        </Text>
      </View>
      <View style={styles.counts}>
        <Text style={styles.countLabel}>Seen</Text>
        <Text style={styles.countVal}>{item.encounter_count}</Text>
      </View>
      <View style={styles.counts}>
        <Text style={styles.countLabel}>Practiced</Text>
        <Text style={[styles.countVal, warn && styles.warnText]}>{item.practice_count}</Text>
      </View>
    </TouchableOpacity>
  );
}

