# Rhine Android Spike

Minimal Android spike for
[MikeQu223/Rhine-Music-Database](https://github.com/MikeQu223/Rhine-Music-Database)
(Qt 6 / QML / C++ desktop music panel). This repo is **not** a full port.

## Scope: M1 + M2 only

- M1: a minimal Qt Quick app that builds and launches on Android (arm64-v8a).
- M2: an in-process NodeMobile bridge that reuses the upstream NetEase
  bridge (`MusicBridge/worker.cjs`, bundled in CI), with the iOS-style
  token handshake over a localhost TCP server.
- The UI has two test buttons: start the Node bridge, and probe the
  local-lyrics route (no network, no login).

Out of scope: QQ / Kugou, YTM (the upstream app has none), local-music
import, credential encryption / Keystore, login / QR flows (unless a test
strictly requires them), Media3 / ExoPlayer, foreground-service background
playback, FSR3, the F10 performance panel, tablet layouts, and any
Google Play distribution. This APK is **sideload only**.

## How to build (CI)

Push to `main`, or trigger the workflow manually:

- Workflow: `.github/workflows/build-android.yml`
  (`Build Android debug APK`, on push + `workflow_dispatch`, ubuntu-latest)
- Artifact: `RhineSpike-debug-apk` (the debug APK built by `androiddeployqt`)
- The bridge is **not** committed: CI clones the upstream repo, runs its
  `scripts/bundle-bridge.cjs`, copies this repo's `src/android-runtime.cjs`
  into the bundle, and places the result under
  `src/android/assets/rhine-bridge/` before building. The committed
  `src/android/` directory is intentionally empty apart from this note.

## Toolchain (recorded from the local spike, 2026-10-27)

- Qt 6.12.0, desktop `gcc_64` host kit + `android_arm64_v8a` kit, installed
  with `aqtinstall==3.3.0`, modules `qtmultimedia` + `qtshadertools`
- JDK 21 (Temurin), Android platform `android-36`, build-tools `36.1.0`,
  NDK `27.2.12479018` (r27c), Gradle 9.5.1 / AGP 9.2.1 (as pinned by the
  Qt 6.12 template)
- NodeMobile: digidem `v24.20.0-0`, Android full zip, SHA-256
  `f5ffbaf4f2679fa9180b0758c637c2f8fc8828300f95129badf213a028fb37bb`
- Upstream bridge bundling runs on Node 24, targeting node22 (the upstream
  bundle script's default)

## Device verification still pending

No APK from this repo has been run on a device in any build environment.
The following still need a Samsung Galaxy S26 Ultra (arm64-v8a) test by the
owner, after installing the CI artifact:

- [ ] APK installs and launches without crashing
- [ ] Node boots in-process, token handshake passes, wrong-token is rejected
- [ ] `worker_threads` works on Android, or the main-thread fallback runs
      `worker.cjs`
- [ ] TMPDIR is honoured: `anonymous_token` (mode 0600) appears in the
      app-private tmp dir passed to the Worker (note: `xeapi_public_key`
      is lazy, written only before a real XEAPI request, not at startup)
- [ ] A fresh NetEase search returns real results (airplane-mode control:
      fails on, succeeds off)
- [ ] One resolved track plays 30+ seconds in the foreground, with
      `mediaStatus`/`playbackState`/`position()` advancing, `dumpsys audio`
      and `dumpsys media.audio_flinger` showing an active player/track,
      and audible output
