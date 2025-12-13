import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from '../styles/theme';
import { useAppContext } from '../context/AppContext';
import { unhideKanji, unhideWord } from '../../services/database';

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { hiddenKanjiItems, hiddenWordGroups, loadHiddenItems, reloadList } = useAppContext();

  const handleUnhideKanji = async (character: string) => {
    await unhideKanji(character);
    await loadHiddenItems();
    await reloadList();
  };

  const handleUnhideWord = async (aliases: string[]) => {
    await Promise.all(aliases.map((a) => unhideWord(a)));
    await loadHiddenItems();
    await reloadList();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: Math.max(24, insets.bottom + 12) }}>
      <Text style={styles.settingsTitle}>Settings</Text>

      <View style={styles.settingsSection}>
        <Text style={styles.settingsSectionTitle}>Hidden items</Text>

        <Text style={styles.settingsSubTitle}>Kanji</Text>
        {hiddenKanjiItems.length === 0 ? (
          <Text style={styles.mutedSmallCenter}>No hidden kanji.</Text>
        ) : (
          hiddenKanjiItems.map((k) => (
            <View key={`hk:${k.character}`} style={styles.hiddenRow}>
              <Text style={styles.hiddenMain}>{k.character}</Text>
              <TouchableOpacity
                style={styles.hiddenX}
                onPress={() => handleUnhideKanji(k.character)}
                activeOpacity={0.8}
                accessibilityLabel={`Unhide ${k.character}`}
              >
                <Text style={styles.hiddenXText}>×</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <Text style={[styles.settingsSubTitle, { marginTop: 14 }]}>Words</Text>
        {hiddenWordGroups.length === 0 ? (
          <Text style={styles.mutedSmallCenter}>No hidden words.</Text>
        ) : (
          hiddenWordGroups.map((w) => (
            <View key={`hw:${w.display}`} style={styles.hiddenRow}>
              <Text style={styles.hiddenMain} numberOfLines={1} ellipsizeMode="tail">
                {w.display}
              </Text>
              <TouchableOpacity
                style={styles.hiddenX}
                onPress={() => handleUnhideWord(w.aliases)}
                activeOpacity={0.8}
                accessibilityLabel={`Unhide ${w.display}`}
              >
                <Text style={styles.hiddenXText}>×</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

