import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.f28d224c938f4431bf9193819af85fa5',
  appName: 'Ayro',
  webDir: 'dist',
  server: {
    url: 'https://f28d224c-938f-4431-bf91-93819af85fa5.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
