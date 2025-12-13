import React, { useCallback, useEffect } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { styles } from '../styles/theme';
import { useAppContext } from '../context/AppContext';
import { useBackHandler } from '../hooks';
import { Header } from '../components';
import {
  UiBusyModal,
  CaptureModal,
  EditModal,
  FullImageModal,
  WordKanjiModal,
} from '../components/modals';
import { ListScreen } from './ListScreen';
import { DetailScreen } from './DetailScreen';
import { GalleryScreen } from './GalleryScreen';
import { SettingsScreen } from './SettingsScreen';
import { Screen } from '../types';

interface MainScreenProps {
  onOpenSettings: (setScreen: (s: Screen) => void) => void;
}

export function MainScreen({ onOpenSettings }: MainScreenProps) {
  const {
    screen,
    setScreen,
    processing,
    processingStatus,
    uiBusy,
    uiBusyLabel,
    editModal,
    setEditModal,
    captureModal,
    setCaptureModal,
    wordKanjiModal,
    setWordKanjiModal,
    fullImagePhoto,
    setFullImagePhoto,
    fullImageMeta,
    setFullImageMeta,
    fullImageMenuVisible,
    setFullImageMenuVisible,
    metaCache,
    openDetail,
    openGallery,
    openEditForPhoto,
    saveEditForPhoto,
    onDeletePhoto,
    captureFromCamera,
    pickFromGallery,
  } = useAppContext();

  useEffect(() => {
    onOpenSettings(setScreen);
  }, [onOpenSettings, setScreen]);

  // Android hardware back button handler
  const handleBackPress = useCallback(() => {
    // Close top-most UI first
    if (fullImageMenuVisible) {
      setFullImageMenuVisible(false);
      return true;
    }
    if (fullImagePhoto) {
      setFullImagePhoto(null);
      setFullImageMeta(null);
      return true;
    }
    if (editModal.visible) {
      setEditModal({ visible: false, photo: null, kanjiText: '', wordsText: '' });
      return true;
    }
    if (captureModal.visible) {
      setCaptureModal({ visible: false, photoType: null });
      return true;
    }

    if (uiBusy) {
      return true;
    }

    if (screen !== 'list') {
      setScreen('list');
      return true;
    }

    return false;
  }, [
    captureModal.visible,
    editModal.visible,
    fullImageMenuVisible,
    fullImagePhoto,
    screen,
    uiBusy,
    setCaptureModal,
    setEditModal,
    setFullImageMenuVisible,
    setFullImagePhoto,
    setFullImageMeta,
    setScreen,
  ]);

  useBackHandler(handleBackPress);

  const handleNavigateToList = useCallback(() => setScreen('list'), [setScreen]);

  const handleCloseEditModal = useCallback(() => {
    setEditModal({ visible: false, photo: null, kanjiText: '', wordsText: '' });
  }, [setEditModal]);

  const handleCloseCaptureModal = useCallback(() => {
    setCaptureModal({ visible: false, photoType: null });
  }, [setCaptureModal]);

  const handleCloseWordKanjiModal = useCallback(() => {
    setWordKanjiModal((s) => ({ ...s, visible: false }));
  }, [setWordKanjiModal]);

  const handleCloseFullImage = useCallback(() => {
    setFullImageMenuVisible(false);
    setFullImagePhoto(null);
    setFullImageMeta(null);
  }, [setFullImageMenuVisible, setFullImagePhoto, setFullImageMeta]);

  const handleToggleFullImageMenu = useCallback(() => {
    setFullImageMenuVisible((v) => !v);
  }, [setFullImageMenuVisible]);

  const handleEditFromFullImage = useCallback(async () => {
    if (!fullImagePhoto) return;
    const p = fullImagePhoto;
    setFullImageMenuVisible(false);
    setFullImagePhoto(null);
    setFullImageMeta(null);
    await openEditForPhoto(p);
  }, [fullImagePhoto, openEditForPhoto, setFullImageMenuVisible, setFullImagePhoto, setFullImageMeta]);

  const handleSelectKanjiFromModal = useCallback(
    (k: string) => {
      setWordKanjiModal((s) => ({ ...s, visible: false }));
      openDetail('kanji', k);
    },
    [openDetail, setWordKanjiModal]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Header
        currentScreen={screen}
        onNavigateToList={handleNavigateToList}
        onNavigateToGallery={openGallery}
      />

      <UiBusyModal visible={uiBusy} label={uiBusyLabel} />

      {processing && (
        <View style={styles.processingBar}>
          <Text style={styles.processingText}>{processingStatus}</Text>
        </View>
      )}

      {screen === 'settings' && <SettingsScreen />}
      {screen === 'list' && <ListScreen />}
      {screen === 'detail' && <DetailScreen />}
      {screen === 'gallery' && <GalleryScreen />}

      <WordKanjiModal
        state={wordKanjiModal}
        metaCache={metaCache}
        onClose={handleCloseWordKanjiModal}
        onSelectKanji={handleSelectKanjiFromModal}
      />

      <FullImageModal
        photo={fullImagePhoto}
        meta={fullImageMeta}
        menuVisible={fullImageMenuVisible}
        onClose={handleCloseFullImage}
        onToggleMenu={handleToggleFullImageMenu}
        onEdit={handleEditFromFullImage}
        onDelete={() => fullImagePhoto && onDeletePhoto(fullImagePhoto)}
      />

      <EditModal
        state={editModal}
        onClose={handleCloseEditModal}
        onSave={saveEditForPhoto}
        onChangeKanji={(t) => setEditModal((s) => ({ ...s, kanjiText: t }))}
        onChangeWords={(t) => setEditModal((s) => ({ ...s, wordsText: t }))}
      />

      <CaptureModal
        state={captureModal}
        onClose={handleCloseCaptureModal}
        onCamera={captureFromCamera}
        onGallery={pickFromGallery}
      />
    </SafeAreaView>
  );
}

