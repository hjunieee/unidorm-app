# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# npm usage

On this machine a broken shell snapshot wraps `npm`/`node`/`npx` in a `__work`
function that recurses infinitely (`command not found: __work` →
`maximum nested function level reached`). Before running any npm/node command,
strip the wrappers in the same shell invocation:

```sh
unset -f npm node npx 2>/dev/null
npm run prebuild
```

The real binaries live at `/opt/homebrew/bin` (node v25, npm 11). Shell state
does not persist between commands, so the `unset -f` must be in the same line.

# Shared bridge — vendored source (NOT an npm package, NOT a submodule)

The native↔web message contract lives in this repo at `packages/unidorm-bridge`
and is compiled **from source** (relative imports, e.g. in
`src/components/WebViewContainer.tsx`). This repo holds the original;
`UNIDorm-web` keeps a copy at its own `packages/unidorm-bridge` (see the README
there for which files and the commit it was copied from).

- `zod` is a **direct dependency** here precisely because the bridge source is
  compiled in-app (bridge `messages.ts` imports it).
- tsc and eslint skip the bridge folder's own files (`tsconfig.json` `exclude`,
  `eslint.config.js` `ignores: ["packages/**"]`); only the source we import is
  type-checked (via import-following).
- **Changing the contract**: edit `packages/unidorm-bridge/src` here, then copy
  `messages.ts`, `channel.ts` and `adapters/web.ts` into `UNIDorm-web`'s
  `packages/unidorm-bridge/src` and update the commit noted in its README.
- The bridge source must compile under **both** consumers' strict tsconfig
  (e.g. the web's `noUnusedLocals`).

# Android widget renderer — git submodule, npm-published OSS package

`expo-widgets-glance` (Android/Jetpack Glance renderer for `expo-widgets` home
screen widgets — see `src/widgets/*.tsx`) is a **standalone OSS package**,
published at [`KimWash/expo-widgets-glance`](https://github.com/KimWash/expo-widgets-glance)
and (once published) on npm as `expo-widgets-glance`. Unlike `unidorm-bridge`
above, it's meant to be generically reusable outside this app — so it's
consumed here as a git submodule **for now**, pinned to a real npm release
being cut. Once that lands, switch `package.json`'s
`"expo-widgets-glance": "file:packages/expo-widgets-glance"` to a real
version range (`"^0.1.0"`) and drop the submodule — no reason to keep both.

- **Clone**: `git clone --recurse-submodules …`, or
  `git submodule update --init` after a plain clone. `npm run postinstall`
  (runs automatically after `npm install`) handles this plus one more step:
  the submodule's own config plugin ships
  pre-built JS (`plugin/build/`) in its **npm tarball**, but that directory is
  gitignored in the source repo — so a submodule checkout needs
  `cd packages/expo-widgets-glance && npm install && npm run build:plugin`
  once (wired into `npm run widgets-glance:build`, part of `postinstall`) or
  `app.plugin.js`'s `require('./plugin/build/index')` fails. Forgetting this
  after a fresh clone or a submodule update is the most likely thing to break.
- **Changing anything Android-widget-related**: edit + commit + push in the
  `expo-widgets-glance` repo (not here — this repo's copy is a read-only
  checkout), then bump the pin — `git submodule update --remote
  packages/expo-widgets-glance && git add packages/expo-widgets-glance` — and
  rebuild the plugin (`npm run widgets-glance:build`).
- `src/widgets/*.tsx` files (`NextClassWidget`, `TodayClassesWidget`,
  `BusArrivalWidget`, `CafeteriaMenuWidget`, `TimetableWidget`) stay in this
  app — they're UniDorm-specific, unlike the renderer itself.
