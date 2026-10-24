// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // packages/* carry their own tooling (the bridge contract, the widget
    // renderer submodule); the app only compiles their source, it doesn't lint it here.
    ignores: ["dist/*", "packages/**"],
  }
]);
