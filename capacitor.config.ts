import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'church.presencetorch.app',
  appName: 'Presence Torch',
  webDir: 'dist',
  ios: {
    // Let CSS env(safe-area-inset-*) handle notch/home bar; avoid WebView letterboxing.
    contentInset: 'never',
    backgroundColor: '#0a0f1a',
  },
  android: {
    backgroundColor: '#0a0f1a',
  },
  plugins: {
    FirebaseAuthentication: {
      // Native Google/Apple sheets, then JS signInWithCredential for Firestore.
      // iOS Info.plist must set GIDClientID (iOS client) and GIDServerClientID (web client)
      // so the Google ID token audience matches the Firebase JS SDK.
      skipNativeAuth: true,
      providers: ['google.com', 'apple.com'],
    },
    BluetoothLe: {
      displayStrings: {
        scanning: 'Scanning for PTT buttons…',
        cancel: 'Cancel',
        availableDevices: 'Available PTT buttons',
        noDeviceFound: 'No PTT button found',
      },
    },
  },
};

export default config;
