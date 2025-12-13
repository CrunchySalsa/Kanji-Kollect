import React, { useCallback, useEffect, useState } from 'react';
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
    goBack,
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
    fullImageMenuTab,
    setFullImageMenuTab,
    fullImageMenuScrollY,
    setFullImageMenuScrollY,
    metaCache,
    openDetail,
    openGallery,
    openEditForPhoto,
    saveEditForPhoto,
    applyEditsForPhoto,
    reprocessPhoto,
    onDeletePhoto,
    captureFromCamera,
    pickFromGallery,
  } = useAppContext();

  const [reprocessBusy, setReprocessBusy] = useState(false);

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
      return goBack();
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
    goBack,
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

  const handleReprocessFromFullImage = useCallback(async () => {
    if (!fullImagePhoto) return;
    setReprocessBusy(true);
    try {
      await reprocessPhoto(fullImagePhoto);
    } finally {
      setReprocessBusy(false);
    }
  }, [fullImagePhoto, reprocessPhoto]);

  const handleOpenKanjiFromFullImage = useCallback(
    (k: string) => {
      if (!k) return;
      openDetail('kanji', k);
    },
    [openDetail]
  );

  const handleOpenWordFromFullImage = useCallback(
    (w: string) => {
      if (!w) return;
      openDetail('word', w);
    },
    [openDetail]
  );

  const handleApplyEditsFromFullImage = useCallback(
    async (next: { kanji: string[]; words: string[] }) => {
      if (!fullImagePhoto) return;
      await applyEditsForPhoto(fullImagePhoto, next.kanji, next.words);
    },
    [applyEditsForPhoto, fullImagePhoto]
  );

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
      {/* Keep ListScreen mounted to preserve scroll position when navigating away and back */}
      <View style={{ flex: 1, display: screen === 'list' ? 'flex' : 'none' }} pointerEvents={screen === 'list' ? 'auto' : 'none'}>
        <ListScreen />
      </View>
      {screen === 'detail' && <DetailScreen />}
      {screen === 'gallery' && <GalleryScreen />}
      {screen === 'settings' && <SettingsScreen />}

      <WordKanjiModal
        state={wordKanjiModal}
        metaCache={metaCache}
        onClose={handleCloseWordKanjiModal}
        onSelectKanji={handleSelectKanjiFromModal}
      />

      <FullImageModal
        photo={fullImagePhoto}
        meta={fullImageMeta}
        metaCache={metaCache}
        menuVisible={fullImageMenuVisible}
        reprocessBusy={reprocessBusy}
        menuTab={fullImageMenuTab}
        onMenuTabChange={setFullImageMenuTab}
        scrollY={fullImageMenuScrollY}
        onScrollYChange={setFullImageMenuScrollY}
        onClose={handleCloseFullImage}
        onToggleMenu={handleToggleFullImageMenu}
        onReprocess={handleReprocessFromFullImage}
        onApplyEdits={handleApplyEditsFromFullImage}
        onOpenKanji={handleOpenKanjiFromFullImage}
        onOpenWord={handleOpenWordFromFullImage}
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

