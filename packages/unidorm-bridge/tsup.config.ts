import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    web: "src/adapters/web.ts",
    native: "src/adapters/native.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
  external: ["zod", "react", "react-native", "react-native-webview"],
});
