const os = require('os');
const package = require('./package.json');
const path = require('path');

function getIcon() {
  switch (os.platform()) {
    case 'darwin':
      return path.join('.', 'assets', 'icons', 'icon.icns');
    case 'linux':
      return path.join('.', 'assets', 'icons', 'icon.png');
    case 'win32':
      return path.join('.', 'assets', 'icons', 'icon.ico');
    default:
      throw new Error(`forge.config.js error: Unsupported OS ${os.platform()}`);
  }
}

module.exports = {
  packagerConfig: {
    name: package.productName,
    executableName: package.productName,
    asar: true,
    icon: getIcon(),
    ignore: [
      /^\/(readme_assets|.vscode|.github|packaging\/python-binary\/build)/,
      /\/packaging\/python-binary\/build\//,
      'garmin_video_processing.spec',
      'README.md',
      'forge.config.js',
      '.gitignore',
      'entitlements.plist',
    ],
    env: {
      NODE_ENV: 'production',
    },
    osxSign: {
      identity: process.env.MAC_SIGNING_IDENTITY,
      'hardened-runtime': true,
      'entitlements': './entitlements.plist',
      'entitlements-inherit': './entitlements.plist',
      'gatekeeper-assess': false,
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        "name": "ApexSense",
        "setupExe": "ApexSenseSetup.exe",
        "setupIcon": getIcon(),
        "authors": "Daniel Kulas",
        "loadingGif": "",
        "certificateFile": process.env.WIN_CERT_PATH,
        "certificatePassword": process.env.WIN_CERT_PASSWORD,
        "version": package.version,
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: "./assets/icons/icon.icns",
        name: package.productName,
      }
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
