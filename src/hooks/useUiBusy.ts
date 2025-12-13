import { useState, useCallback } from 'react';

export function useUiBusy() {
  const [uiBusy, setUiBusy] = useState(false);
  const [uiBusyLabel, setUiBusyLabel] = useState('Loading…');

  const runWithUiBusy = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    setUiBusyLabel(label);
    setUiBusy(true);
    try {
      return await fn();
    } finally {
      setUiBusy(false);
      setUiBusyLabel('Loading…');
    }
  }, []);

  return { uiBusy, uiBusyLabel, runWithUiBusy };
}

