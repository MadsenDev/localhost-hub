module.exports = {
  appId: 'dev.localhost.hub',
  directories: {
    output: 'release'
  },
  files: [
    'dist-electron/**/*',
    'dist/**/*',
    'node_modules/**/*',
    'package.json'
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
    target: 'nsis',
    signDlls: false
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

