import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'church.presencetorch.app',
  appName: 'Presence Torch',
  webDir: 'dist',
  server: {
    url: 'https://presencetorchchurch.vercel.app',
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: [
      'www.google.com',
      'www.gstatic.com',
      'www.recaptcha.net',
    ],
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
