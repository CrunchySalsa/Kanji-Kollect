import { useRef, useMemo, useEffect, useCallback } from 'react';
import { Animated, PanResponder, PanResponderInstance } from 'react-native';

interface UseSwipePagerOptions {
  activeIndex: number;
  pageCount: number;
  width: number;
  onIndexChange: (index: number) => void;
}

interface UseSwipePagerResult {
  translateX: Animated.Value;
  panResponder: PanResponderInstance;
}

export function useSwipePager({
  activeIndex,
  pageCount,
  width,
  onIndexChange,
}: UseSwipePagerOptions): UseSwipePagerResult {
  const translateX = useRef(new Animated.Value(0)).current;
  const swipeBaseXRef = useRef(0);

  const clamp = useCallback((n: number, min: number, max: number) => Math.max(min, Math.min(max, n)), []);

  useEffect(() => {
    if (!width) return;
    const target = -activeIndex * width;
    Animated.timing(translateX, {
      toValue: target,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, translateX, width]);

  const panResponder = useMemo(() => {
    const maxIndex = pageCount - 1;
    const minTranslate = -maxIndex * width;

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => {
        if (!width) return false;
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        if (ax < 10) return false;
        return ax > ay * 1.2;
      },
      onPanResponderGrant: () => {
        if (!width) return;
        translateX.stopAnimation();
        swipeBaseXRef.current = -activeIndex * width;
      },
      onPanResponderMove: (_evt, g) => {
        if (!width) return;
        const next = clamp(swipeBaseXRef.current + g.dx, minTranslate, 0);
        translateX.setValue(next);
      },
      onPanResponderRelease: (_evt, g) => {
        if (!width) return;
        const threshold = width * 0.22;
        let nextIndex = activeIndex;
        if (g.dx <= -threshold || g.vx <= -0.55) nextIndex = Math.min(maxIndex, activeIndex + 1);
        if (g.dx >= threshold || g.vx >= 0.55) nextIndex = Math.max(0, activeIndex - 1);

        onIndexChange(nextIndex);

        Animated.timing(translateX, {
          toValue: -nextIndex * width,
          duration: 180,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        if (!width) return;
        Animated.timing(translateX, {
          toValue: -activeIndex * width,
          duration: 180,
          useNativeDriver: true,
        }).start();
      },
    });
  }, [activeIndex, clamp, translateX, width, pageCount, onIndexChange]);

  return { translateX, panResponder };
}

