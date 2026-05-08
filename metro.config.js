const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const backendPath = path.resolve(projectRoot, 'backend');

const config = getDefaultConfig(projectRoot);

// Prevent Metro from trying to bundle the Node/Express backend inside Expo.
config.resolver.blockList = new RegExp(
  `${backendPath.replace(/[/\\\\]/g, '[/\\\\]')}[/\\\\].*`
);

module.exports = config;
