import { useCallback } from 'react';
import * as Speech from 'expo-speech';

export function useSpeech() {
  const speakJa = useCallback((text: string) => {
    if (!text) return;
    try {
      // Stop any previous utterance to avoid overlap.
      Speech.stop();
      Speech.speak(text, {
        language: 'ja-JP',
        rate: 0.95,
        pitch: 1.0,
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  return { speakJa };
}

