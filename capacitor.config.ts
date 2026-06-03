import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.takken.numbers',
  appName: 'TakkenNumbers',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    AdMob: {
      initializeOnStartup: true
    }
  }
};

export default config;
