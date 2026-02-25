import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ayro.app',
  appName: 'Ayro',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
