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
    target: 'nsis'
  },
  linux: {
    icon: 'buildResources/linux-icons',
    category: 'Development',
    target: ['AppImage', 'deb']
  }
};

