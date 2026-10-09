#!/usr/bin/env node

// Builds the shared widget runtime bundle for Android — the counterpart of
// expo-widgets' own `scripts/build-bundle.mjs`. Reuses that package's own
// `bundle/index.ts` entry file and `bundle/metro.config.js` verbatim (see
// README "Architecture"): nothing in that bundle is iOS-specific — it's a
// Metro build with `expo`/`expo-modules-core`/`react`/`react-native` swapped
// for plain-object-producing stubs, so the exact same source, rebuilt with
// `--platform android`, is exactly the runtime `WidgetJsHost` expects.
//
// Usage: node scripts/build-android-bundle.mjs [projectRoot] [outputPath]
//   projectRoot  defaults to cwd — the app that has `expo-widgets` installed.
//   outputPath   defaults to this package's own
//                android/src/main/assets/expo_widgets_glance_runtime.js,
//                for local testing. A real integration should have the
//                config plugin write this into the *consuming app's*
//                android/app/src/main/assets/ during prebuild instead of
//                requiring this script to be run by hand — see README
//                "What's not done yet".

import spawn from '@expo/spawn-async';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(__dirname);

const projectRoot = process.argv[2] ?? process.cwd();
const outputPath =
  process.argv[3] ??
  path.join(__dirname, '../android/src/main/assets/expo_widgets_glance_runtime.js');

const expoWidgetsBundleDir = path.join(
  path.dirname(require.resolve('expo-widgets/package.json', { paths: [projectRoot] })),
  'bundle'
);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const nodePath = process.env.NODE_BINARY || 'node';

const result = await spawn(
  nodePath,
  [
    require.resolve('expo/bin/cli', { paths: [projectRoot] }),
    'export:embed',
    '--platform',
    'android',
    '--bundle-output',
    outputPath,
    '--entry-file',
    path.join(expoWidgetsBundleDir, 'index.ts'),
    '--dev',
    'false',
    '--skip-server',
  ],
  {
    stdio: 'inherit',
    cwd: projectRoot,
    env: {
      ...process.env,
      // Same metro.config.js expo-widgets uses to build its own iOS
      // bundle — the expo/react/react-native → plain-object stub swap that
      // makes the whole thing platform-agnostic in the first place.
      EXPO_OVERRIDE_METRO_CONFIG: path.join(expoWidgetsBundleDir, '../metro.config.js'),
    },
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Wrote ${outputPath}`);
