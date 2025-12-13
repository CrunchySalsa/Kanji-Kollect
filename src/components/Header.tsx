import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { styles } from '../styles/theme';
import { Screen } from '../types';

interface HeaderProps {
  currentScreen: Screen;
  onNavigateToList: () => void;
  onNavigateToGallery: () => void;
}

export function Header({ currentScreen, onNavigateToList, onNavigateToGallery }: HeaderProps) {
  const navigation = useNavigation();

  return (
    <View style={styles.header}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          activeOpacity={0.85}
          accessibilityLabel="Menu"
        >
          <Text style={styles.headerBtnText}>☰</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={onNavigateToList}
          activeOpacity={0.85}
          accessibilityLabel="Home"
        >
          <Text style={styles.headerBtnText}>⌂</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.headerTitle}>Kanji Kollect</Text>
      <View style={styles.headerButtons}>
        {currentScreen !== 'gallery' && (
          <TouchableOpacity style={styles.headerBtn} onPress={onNavigateToGallery}>
            <Text style={styles.headerBtnText}>Gallery</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

