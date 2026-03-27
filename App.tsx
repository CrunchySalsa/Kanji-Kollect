import 'react-native-gesture-handler';
import React, { useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProvider, useAppContext } from './src/context';
import { MainScreen } from './src/screens/MainScreen';
import { ApiKeyModal } from './src/components/modals';
import { styles } from './src/styles/theme';
import { Screen } from './src/types';

const Drawer = createDrawerNavigator();

function CustomDrawerContent(props: any) {
  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: '#0f0f1a' }}>
      <View style={styles.drawerHeader}>
        <Text style={styles.drawerTitle}>Kanji Kollect</Text>
      </View>
      <DrawerItem
        label="Settings"
        labelStyle={styles.drawerItemLabel}
        style={styles.drawerItem}
        onPress={() => {
          props.navigation.closeDrawer();
          props.onOpenSettings();
        }}
      />
    </DrawerContentScrollView>
  );
}

function AppInner() {
  const setScreenRef = useRef<((s: Screen) => void) | null>(null);
  const { apiKey, apiKeyLoading, setApiKey } = useAppContext();
  const [dismissedApiKeyPrompt, setDismissedApiKeyPrompt] = useState(false);

  const showApiKeyModal = !apiKeyLoading && !apiKey && !dismissedApiKeyPrompt;

  return (
    <>
      <ApiKeyModal
        visible={showApiKeyModal}
        onSubmit={setApiKey}
        onSkip={() => setDismissedApiKeyPrompt(true)}
      />
      <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: '#0f0f1a',
          width: 280,
        },
        drawerPosition: 'left',
        swipeEnabled: true,
      }}
      drawerContent={(props) => (
        <CustomDrawerContent
          {...props}
          onOpenSettings={() => {
            if (setScreenRef.current) {
              setScreenRef.current('settings');
            }
          }}
        />
      )}
    >
      <Drawer.Screen name="Main">
        {() => (
          <MainScreen
            onOpenSettings={(setScreen) => {
              setScreenRef.current = setScreen;
            }}
          />
        )}
      </Drawer.Screen>
    </Drawer.Navigator>
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AppProvider>
            <AppInner />
          </AppProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
