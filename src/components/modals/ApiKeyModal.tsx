import React, { useState } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '../../styles/theme';

interface ApiKeyModalProps {
  visible: boolean;
  onSubmit: (apiKey: string) => void;
}

export function ApiKeyModal({ visible, onSubmit }: ApiKeyModalProps) {
  const insets = useSafeAreaInsets();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const handleSubmit = () => {
    const trimmed = apiKey.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.card, { marginTop: insets.top + 40 }]}>
          <Text style={modalStyles.title}>Welcome to Kanji Kollect</Text>
          <Text style={modalStyles.subtitle}>
            This app uses Google Cloud Vision for OCR. Please enter your API key to get started.
          </Text>

          <View style={modalStyles.inputRow}>
            <TextInput
              style={modalStyles.input}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="Paste your Google Cloud Vision API key"
              placeholderTextColor={colors.textDim}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
              textContentType="none"
              autoFocus
            />
            <TouchableOpacity
              onPress={() => setShowKey(!showKey)}
              style={modalStyles.toggleBtn}
              activeOpacity={0.7}
            >
              <Text style={modalStyles.toggleText}>{showKey ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={modalStyles.hint}>
            Get an API key from console.cloud.google.com → APIs & Services → Credentials
          </Text>

          <TouchableOpacity
            onPress={handleSubmit}
            style={[modalStyles.submitBtn, !apiKey.trim() && modalStyles.submitBtnDisabled]}
            activeOpacity={0.8}
            disabled={!apiKey.trim()}
          >
            <Text style={modalStyles.submitText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayFull,
    paddingHorizontal: spacing.xl,
    justifyContent: 'flex-start',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xxl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: typography.xxlarge,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.medium,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceDark,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: typography.medium,
    fontWeight: '600',
  },
  toggleBtn: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  toggleText: {
    color: colors.textMuted,
    fontSize: typography.body,
    fontWeight: '700',
  },
  hint: {
    color: colors.textDim,
    fontSize: typography.small,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 16,
  },
  submitBtn: {
    backgroundColor: colors.success,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: colors.surfaceLight,
  },
  submitText: {
    color: colors.dark,
    fontWeight: '800',
    fontSize: typography.large,
  },
});

