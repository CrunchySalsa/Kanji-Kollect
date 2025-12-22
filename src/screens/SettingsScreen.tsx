import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles, colors, radii, spacing, typography } from '../styles/theme';
import { useAppContext } from '../context/AppContext';
import { unhideKanji, unhideWord } from '../../services/database';

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { hiddenKanjiItems, hiddenWordGroups, loadHiddenItems, reloadList, apiKey, setApiKey } = useAppContext();
  const [apiKeyInput, setApiKeyInput] = useState(apiKey ?? '');
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    setApiKeyInput(apiKey ?? '');
  }, [apiKey]);

  const handleSaveApiKey = async () => {
    await setApiKey(apiKeyInput);
    Alert.alert('Saved', 'API key has been saved.');
  };

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

      <View style={[styles.settingsSection, { marginBottom: spacing.md }]}>
        <Text style={styles.settingsSectionTitle}>Google Cloud Vision API Key</Text>
        <Text style={[styles.mutedSmall, { marginBottom: spacing.sm }]}>
          Required for OCR. Get one from Google Cloud Console.
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
          <TextInput
            style={{
              flex: 1,
              backgroundColor: colors.surfaceDark,
              borderRadius: radii.lg,
              paddingVertical: 10,
              paddingHorizontal: spacing.md,
              color: colors.text,
              fontSize: typography.medium,
              fontWeight: '600',
            }}
            value={apiKeyInput}
            onChangeText={setApiKeyInput}
            placeholder="Paste your API key"
            placeholderTextColor={colors.textDim}
            secureTextEntry={!showApiKey}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
          />
          <TouchableOpacity
            onPress={() => setShowApiKey(!showApiKey)}
            style={{
              backgroundColor: colors.surfaceDark,
              borderRadius: radii.lg,
              paddingHorizontal: spacing.md,
              justifyContent: 'center',
            }}
            activeOpacity={0.7}
          >
            <Text style={{ color: colors.textMuted, fontSize: typography.body, fontWeight: '700' }}>
              {showApiKey ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={handleSaveApiKey}
          style={{
            backgroundColor: colors.success,
            borderRadius: radii.lg,
            paddingVertical: spacing.md,
            alignItems: 'center',
          }}
          activeOpacity={0.8}
        >
          <Text style={{ color: colors.dark, fontWeight: '800', fontSize: typography.medium }}>Save API Key</Text>
        </TouchableOpacity>
      </View>

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

