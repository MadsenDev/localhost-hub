module.exports = {
  appId: 'dev.localhost.hub',
  directories: {
    output: 'release'
  },
  files: [
    'dist-electron/**/*',
    'dist/**/*',
    'package.json'
  ],
  // Manually include toml to avoid electron-builder dependency parsing issues
  // electron-builder will auto-detect other dependencies from package.json
  extraFiles: [
    {
      from: 'node_modules/toml',
      to: 'node_modules/toml'
    }
  ],
  extraResources: [
    {
      from: 'buildResources',
      to: '.'
    }
  ],
  mac: {
    icon: 'buildResources/icon.icns',
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    entitlements: 'buildResources/entitlements.mac.plist'
  },
  win: {
    icon: 'buildResources/icon.ico',
    target: 'nsis'
    // Note: If you encounter "Cannot create symbolic link" errors during signing,
    // run: npm run clear:cache
    // Then either enable Developer Mode (Settings > Update & Security > For Developers)
    // or run the build as Administrator
  },
  linux: {
    icon: 'buildResources/linux-icons',
    category: 'Development',
    target: ['AppImage', 'deb']
  }
};

