import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ayvro.app',
  appName: 'Ayvro',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0F3D3E',
  },
  plugins: {
    SplashScreen: {
      // Safety net: native side auto-hides after 2s even if JS never calls hide().
      // JS still calls SplashScreen.hide() in useNativeApp on first paint for a
      // faster experience when the bundle is ready quickly.
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0F3D3E',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0F3D3E',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'DEFAULT',
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#0F3D3E',
    },
    App: {
      launchUrl: 'com.ayvro.app://',
    },
  },
};

export default config;
