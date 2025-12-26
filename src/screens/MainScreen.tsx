import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles } from '../styles/theme';
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
import { FavoritesScreen } from './FavoritesScreen';
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
    processingPhotoType,
    pickerBusy,
    pickerBusyPhotoType,
    uiBusy,
    uiBusyLabel,
    initialLoadVisible,
    initialLoadLabel,
    initialLoadProgress,
    editModal,
    setEditModal,
    captureModal,
    setCaptureModal,
    wordKanjiModal,
    setWordKanjiModal,
    fullImagePhoto,
    setFullImagePhoto,
    fullImagePhotos,
    fullImageIndex,
    setFullImageIndex,
    fullImageMeta,
    fullImageMenuVisible,
    setFullImageMenuVisible,
    fullImageMenuTab,
    setFullImageMenuTab,
    fullImageMenuScrollY,
    setFullImageMenuScrollY,
    closeFullImageViewer,
    metaCache,
    openDetail,
    openGallery,
    openFavorites,
    favorites,
    openEditForPhoto,
    saveEditForPhoto,
    applyEditsForPhoto,
    reprocessPhoto,
    retakeFromCamera,
    retakeFromGallery,
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
      closeFullImageViewer();
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
    closeFullImageViewer,
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
    closeFullImageViewer();
  }, [closeFullImageViewer]);

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
        onNavigateToFavorites={openFavorites}
        hasFavorites={favorites.length > 0}
      />

      <Modal
        transparent
        visible={initialLoadVisible}
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: colors.surface, padding: 20, borderRadius: 12, width: '82%', maxWidth: 380, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>Preparing your library…</Text>
            <Text style={{ color: colors.textMuted, marginBottom: 12 }}>{initialLoadLabel || 'Loading…'}</Text>
            <View style={{ height: 10, borderRadius: 6, backgroundColor: colors.accentSubtle, overflow: 'hidden' }}>
              <View
                style={{
                  height: '100%',
                  width: `${Math.max(5, Math.min(100, Math.round(initialLoadProgress * 100)))}%`,
                  backgroundColor: colors.accent,
                }}
              />
            </View>
            <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 12 }}>{`${Math.round(initialLoadProgress * 100)}%`}</Text>
          </View>
        </View>
      </Modal>

      <UiBusyModal visible={uiBusy} label={uiBusyLabel} />

      {(processing || pickerBusy) && (() => {
        const busyType = pickerBusyPhotoType ?? processingPhotoType;
        const tint =
          busyType === 'encounter' ? colors.success :
          busyType === 'practice' ? colors.info :
          colors.accent;
        const bg =
          busyType === 'encounter' ? 'rgba(34, 197, 94, 0.15)' :
          busyType === 'practice' ? 'rgba(96, 165, 250, 0.15)' :
          colors.accentSubtle;
        const label = pickerBusy ? 'Loading photos…' : processingStatus;
        return (
          <View style={[styles.processingBar, { backgroundColor: bg }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="small" color={tint} style={{ marginRight: 8 }} />
              <Text style={[styles.processingText, { color: tint }]}>{label}</Text>
            </View>
          </View>
        );
      })()}

      {/* Keep ListScreen mounted to preserve scroll position when navigating away and back */}
      <View style={{ flex: 1, display: screen === 'list' ? 'flex' : 'none' }} pointerEvents={screen === 'list' ? 'auto' : 'none'}>
        <ListScreen />
      </View>
      {screen === 'detail' && <DetailScreen />}
      {screen === 'gallery' && <GalleryScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'favorites' && <FavoritesScreen />}

      <WordKanjiModal
        state={wordKanjiModal}
        metaCache={metaCache}
        onClose={handleCloseWordKanjiModal}
        onSelectKanji={handleSelectKanjiFromModal}
      />

      <FullImageModal
        photo={fullImagePhoto}
        photos={fullImagePhotos}
        imageIndex={fullImageIndex}
        meta={fullImageMeta}
        metaCache={metaCache}
        menuVisible={fullImageMenuVisible}
        reprocessBusy={reprocessBusy}
        menuTab={fullImageMenuTab}
        onMenuTabChange={setFullImageMenuTab}
        scrollY={fullImageMenuScrollY}
        onScrollYChange={setFullImageMenuScrollY}
        onIndexChange={setFullImageIndex}
        onClose={handleCloseFullImage}
        onToggleMenu={handleToggleFullImageMenu}
        onReprocess={handleReprocessFromFullImage}
        onRetakeCamera={retakeFromCamera}
        onRetakeGallery={retakeFromGallery}
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

