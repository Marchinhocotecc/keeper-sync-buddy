import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ayvro.app',
  appName: 'Ayvro',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
