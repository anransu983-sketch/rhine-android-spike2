# src/android — package source directory (assets generated in CI)

This directory is intentionally empty in the repository.

`src/CMakeLists.txt` sets `QT_ANDROID_PACKAGE_SOURCE_DIR` to this directory,
and `NodeBridge.prepareBridge()` copies `assets:/rhine-bridge` to app-private
storage at runtime. The CI workflow generates that tree before building:

1. Clone upstream Rhine, run its `scripts/bundle-bridge.cjs`.
2. Copy this repo's `src/android-runtime.cjs` into the bundle as
   `MusicBridge/android-runtime.cjs`.
3. Copy the bundle into `src/android/assets/rhine-bridge/`
   (`MusicBridge/`, `modules/`, `data/`).

Do not commit the generated bundle: the bundled `worker.cjs` alone is
~14 MB and the full tree is ~20 MB, which exceeds the connector snapshot
limit used for the initial push and would churn on every upstream change.
