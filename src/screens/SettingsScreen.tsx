import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles, colors, radii, spacing, typography } from '../styles/theme';
import { useAppContext } from '../context/AppContext';
import { unhideKanji, unhideWord } from '../../services/database';
import { exportBackupToUserStorage, restoreBackupFromPickedFile } from '../../services/backup';

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { hiddenKanjiItems, hiddenWordGroups, loadHiddenItems, reloadList, loadFavorites, apiKey, setApiKey } = useAppContext();
  const [apiKeyInput, setApiKeyInput] = useState(apiKey ?? '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [busyVisible, setBusyVisible] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Working…');

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

  const runBlocking = async (label: string, task: () => Promise<void>) => {
    setBusyLabel(label);
    setBusyVisible(true);
    try {
      await task();
    } finally {
      setBusyVisible(false);
      setBusyLabel('Working…');
    }
  };

  const handleExportBackup = async () => {
    try {
      await runBlocking('Creating backup…', async () => {
        const result = await exportBackupToUserStorage();
        Alert.alert(
          'Backup exported',
          `Created backup folder "${result.filename}" with ${result.imageCount} images in the location you selected.`
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backup export failed.';
      if (message.toLowerCase().includes('cancel')) return;
      Alert.alert('Export failed', message);
    }
  };

  const handleRestoreBackup = async () => {
    Alert.alert(
      'Restore backup',
      'This will replace your current local data (except your API key). Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => {
            runBlocking('Restoring backup…', async () => {
              const result = await restoreBackupFromPickedFile();
              await reloadList();
              await loadHiddenItems();
              await loadFavorites();
              Alert.alert('Restore complete', `Restored backup with ${result.imageCount} images.`);
            }).catch((error) => {
              const message = error instanceof Error ? error.message : 'Backup restore failed.';
              if (message.toLowerCase().includes('cancel')) return;
              Alert.alert('Restore failed', message);
            });
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: Math.max(24, insets.bottom + 12) }}>
      <Modal visible={busyVisible} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.uiBusyOverlay}>
          <View style={styles.uiBusyCard}>
            <ActivityIndicator size="large" color={colors.text} />
            <Text style={styles.uiBusyText}>{busyLabel}</Text>
          </View>
        </View>
      </Modal>

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
        <Text style={styles.settingsSectionTitle}>Backup and restore</Text>
        <Text style={[styles.mutedSmall, { marginBottom: spacing.sm }]}>
          Exports your full local database and images into a backup folder in user-selected storage. API key is not included.
        </Text>
        <TouchableOpacity
          onPress={handleExportBackup}
          style={{
            backgroundColor: colors.info,
            borderRadius: radii.lg,
            paddingVertical: spacing.md,
            alignItems: 'center',
            marginBottom: spacing.sm,
          }}
          activeOpacity={0.8}
        >
          <Text style={{ color: colors.dark, fontWeight: '800', fontSize: typography.medium }}>Export Backup</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleRestoreBackup}
          style={{
            backgroundColor: colors.warningOrange,
            borderRadius: radii.lg,
            paddingVertical: spacing.md,
            alignItems: 'center',
            marginBottom: spacing.md,
          }}
          activeOpacity={0.8}
        >
          <Text style={{ color: colors.dark, fontWeight: '800', fontSize: typography.medium }}>Restore Backup</Text>
        </TouchableOpacity>

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

