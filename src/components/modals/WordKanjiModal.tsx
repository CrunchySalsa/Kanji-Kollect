import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { styles } from '../../styles/theme';
import { WordKanjiModalState, MetaCacheEntry } from '../../types';

interface WordKanjiModalProps {
  state: WordKanjiModalState;
  metaCache: Record<string, MetaCacheEntry>;
  onClose: () => void;
  onSelectKanji: (kanji: string) => void;
}

export function WordKanjiModal({ state, metaCache, onClose, onSelectKanji }: WordKanjiModalProps) {
  return (
    <Modal visible={state.visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.uiBusyOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.kanjiListCard}>
          <Text style={styles.modalTitle}>Kanji in this word</Text>
          {state.kanji.length === 0 ? (
            <Text style={styles.mutedSmall}>No kanji found.</Text>
          ) : (
            state.kanji.map((k) => {
              const meta = metaCache[`kanji:${k}`];
              const gloss = meta?.meaning ?? '';
              return (
                <TouchableOpacity
                  key={k}
                  style={styles.spottedRow}
                  onPress={() => onSelectKanji(k)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.spottedMain} numberOfLines={1} ellipsizeMode="tail">
                    {k}
                    {gloss ? <Text style={styles.spottedGloss}> — {gloss}</Text> : null}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

