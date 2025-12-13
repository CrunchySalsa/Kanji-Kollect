import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Dimensions } from 'react-native';
import { styles } from '../styles/theme';

interface DropdownOption {
  key: string;
  label: string;
}

interface DropdownProps {
  label: string;
  valueLabel: string;
  options: DropdownOption[];
  onSelect: (key: string) => void;
}

export function Dropdown({ label, valueLabel, options, onSelect }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const btnRef = useRef<any>(null);

  const close = useCallback(() => setOpen(false), []);
  const openMenu = useCallback(() => {
    const node: any = btnRef.current;
    if (!node?.measureInWindow) {
      setAnchor(null);
      setOpen(true);
      return;
    }
    node.measureInWindow((x: number, y: number, width: number, height: number) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }, []);

  const window = Dimensions.get('window');
  const menuWidth = Math.max(160, anchor?.width ?? 160);
  const left = anchor ? Math.max(12, Math.min(anchor.x, window.width - menuWidth - 12)) : 12;
  const belowTop = anchor ? anchor.y + anchor.height + 6 : 12;
  const aboveTop = anchor ? Math.max(12, anchor.y - 6) : 12;
  const spaceBelow = window.height - belowTop - 12;
  const spaceAbove = anchor ? anchor.y - 12 : 0;
  const preferBelow = spaceBelow >= 140 || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(120, Math.min(320, preferBelow ? spaceBelow : spaceAbove));
  const top = preferBelow ? belowTop : Math.max(12, aboveTop - maxHeight);

  return (
    <>
      <TouchableOpacity ref={btnRef} style={styles.dropdown} onPress={openMenu} activeOpacity={0.85}>
        <Text style={styles.dropdownLabel}>{label}</Text>
        <Text style={styles.dropdownValue}>{valueLabel}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={close}>
          <View
            style={[styles.dropdownMenu, { left, top, width: menuWidth, maxHeight }]}
            onStartShouldSetResponder={() => true}
          >
            <ScrollView>
              {options.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={styles.dropdownOption}
                  onPress={() => {
                    close();
                    onSelect(o.key);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.dropdownOptionText}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

