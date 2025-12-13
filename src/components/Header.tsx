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
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        activeOpacity={0.85}
        accessibilityLabel="Menu"
      >
        <Text style={styles.headerBtnText}>☰</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Kanji Kollect</Text>
      <View style={styles.headerButtons}>
        {currentScreen !== 'list' && (
          <TouchableOpacity style={styles.headerBtn} onPress={onNavigateToList}>
            <Text style={styles.headerBtnText}>List</Text>
          </TouchableOpacity>
        )}
        {currentScreen !== 'gallery' && (
          <TouchableOpacity style={styles.headerBtn} onPress={onNavigateToGallery}>
            <Text style={styles.headerBtnText}>Gallery</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

