// Metro config for the Expo staff app in a pnpm monorepo.
// Watches the workspace root so it can resolve @saral/core and @saral/tokens,
// and wires NativeWind. node-linker=hoisted (.npmrc) keeps deps flat at the
// repo root, which Metro resolves via nodeModulesPaths.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Don't walk up the tree past the listed nodeModulesPaths.
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: "./global.css" });
