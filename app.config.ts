import type { ConfigContext, ExpoConfig } from 'expo/config';
import fs from 'fs';
import path from 'path';

function loadEnv(appEnv: string) {
  const projectRoot = process.cwd();
  const candidates = [`.env.${appEnv}`, '.env'];

  for (const name of candidates) {
    const filePath = path.join(projectRoot, name);
    if (!fs.existsSync(filePath)) continue;

    const contents = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const equalsIndex = line.indexOf('=');
      if (equalsIndex === -1) continue;

      const key = line.slice(0, equalsIndex).trim();
      let value = line.slice(equalsIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }

    break;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = process.env.APP_ENV ?? 'development';
  loadEnv(appEnv);

  return {
    ...config,
    name: 'kanji-collect',
    slug: 'kanji-kollect',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/app-icon/app-icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    scheme: 'kanji-kollect',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#1a1a2e',
    },
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription:
          'This app uses the camera to capture photos of Japanese text for learning.',
        NSPhotoLibraryUsageDescription:
          'This app accesses your photo library to import images of Japanese text.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/app-icon/adaptive-icon.png',
        backgroundColor: '#1a1a2e',
      },
      edgeToEdgeEnabled: true,
      permissions: ['android.permission.CAMERA', 'android.permission.READ_EXTERNAL_STORAGE'],
      package: 'com.crunchysalsa.kanjikollect',
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
    },
    plugins: [
      'expo-sqlite',
      [
        'expo-image-picker',
        {
          photosPermission:
            'Allow Kanji Kollect to access your photos to import Japanese text images.',
        },
      ],
    ],
    extra: {
      eas: {
        projectId: '87701dfa-f2e8-411c-a5a0-cbe529e3e629',
      },
      appEnv,
    },
  };
};

