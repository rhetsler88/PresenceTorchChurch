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
  plugins: {
    FirebaseAuthentication: {
      // Keep native Google creds on the plugin; bridge into Firebase JS SDK for Firestore.
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
