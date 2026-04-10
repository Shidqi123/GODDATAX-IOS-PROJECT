// Configuration File for GODDATAX

const APP_CONFIG = {
  // App Info
  appName: "GODDATAX",
  appVersion: "2.0",
  developer: "Kutoo",
  isUpdating: false,

  // iOS Support
  minIOSVersion: "15.0",
  maxIOSVersion: "26.4",
  supportedVersions: "15.0 - 26.4",

  // Free Fire Settings
  freeFireSchemes: [
    "freefiremax://",
    "freefire://",
    "https://freefiremobile.com/game"
  ],

  // Login System
  requireLogin: true,
  sessionTimeout: 24, // hours

  // Features
  enabledFeatures: {
    aimAssist: true,
    antiBan: true,
    headshot: true,
    headshotCrosshair: true,
    recoilControl: true,
    performanceMode: true,
    reducePing: true,
    highFPS: true,
    touchBoost: true,
    threeDTouch: true
  },

  // Supabase Configuration
  supabase: {
    url: "https://eemjrotrcftjdazyheoc.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlbWpyb3RyY2Z0amRhenloZW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjE1NzAsImV4cCI6MjA5MDc5NzU3MH0.Uz0uOtpSYVEU88ATO8Wg_HAuGHWdWKuTObBf9D1bQwc",
    tableName: "licenses_ios" // Meisahkan dari tabel android
  },

  // PWA Settings
  pwaSettings: {
    cacheName: "goddatax-v1",
    offlineSupport: true,
    installPrompt: true
  }
};

// Export config
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APP_CONFIG;
}
