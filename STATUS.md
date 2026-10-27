# Rhine Android Spike — Status (summary, 2026-10-27)

Scope: M1 + M2 only. No QQ/Kugou/YTM/local-music/Media3/background playback.
Device verification on the user's S26 Ultra is still pending for every APK item.

## Toolchain (recorded locally, not the v1 checklist's unconfirmed numbers)

- Qt docs (live doc.qt.io Qt for Android page, fetched 2026-10-27):
  API 28–36, NDK Clang 17.0.2 (r27c or 27.2.12479018), JDK 21,
  Gradle 9.5.1 / AGP 9.2.1 (live page; the Qt 6.12 template itself pins
  AGP 9.2.1).
- Locally installed: Qt 6.12.0 desktop gcc_64 + android_arm64_v8a
  (aqtinstall 3.3.0, modules qtmultimedia + qtshadertools), Temurin JDK 21,
  Android cmdline tools, platform-tools, platforms android-36 r02,
  build-tools 36.1.0, NDK r27c = 27.2.12479018.
- Local VM caveat (why CI): the last local APK packaging step failed on a
  VM sandbox proxy bug (Gradle wrapper download via Java HttpURLConnection),
  not on a code bug. GitHub runners have normal network access, so CI
  should not hit that failure mode.

## M2 NodeMobile (verified locally, no device yet)

- digidem/nodejs-mobile v24.20.0-0, Android full zip, 77,677,749 bytes,
  SHA-256 f5ffbaf4f2679fa9180b0758c637c2f8fc8828300f95129badf213a028fb37bb
  — matches the expected hash exactly.
- Zip layout: include/node/ + bin/arm64-v8a|armeabi-v7a|x86_64/libnode.so.
- Entry point: NO plain-C node_start symbol. The Android zip exports
  C++ node::Start(int, char**) (mangled _ZN4node5StartEiPPc, node.h line 318).
  The Android shim must call node::Start, unlike iOS's extern-C node_start.
- 16 KB: LOAD segment alignment field is 0x4000 (16384) — page-size ready
  on the face of the ELF headers; on-device load is still untested.
- Bridge tree: npm ci in a copy of MusicBridge (384 packages), zero
  *.node native addons. Plain worker.cjs does NOT run as-is: it needs the
  generated files (unblock-modules.cjs, netease-endpoints.cjs,
  kugou-package.cjs) from scripts/bundle-bridge.cjs. Bundling succeeded
  (35 NetEase endpoints, 13.13 MB bundled worker, 20 MB total layout).
- Host protocol test (desktop Node v24.22.1, NOT Android): token
  handshake, Worker spawn, /local/lyrics probe returned code 200 with
  plainText "hello", and anonymous_token (mode 0600) appeared in the
  passed TMPDIR. Bundled worker passes the same test.
- On-device Node boot, handshake, Worker, TMPDIR: NOT verified
  (no device/emulator in the local environment). The CI APK is built to be
  installed on the S26 Ultra for this step.

## Corrections to checklist v2 found during the spike

- xeapi_public_key is NOT written at worker startup; it is lazy, written
  only before a real XEAPI request (worker.cjs prepareXeapiKey). The v2
  pass criterion "both files written" is too strict for a boot-only spike:
  anonymous_token at startup is the correct TMPDIR proof.
- Worker stdin is readline-based: input lines MUST end with '\n' or they
  are buffered forever. NodeBridge.sendInput now appends it.
- ios-runtime.cjs discards Worker stderr (resume()), hiding load errors
  (this hid the missing generated-files error). The Android adapter
  forwards stderr as a diagnostic message instead.
- The runtime process itself never sees the passed TMPDIR (iOS design
  forwards env only to the Worker); runtime-env diagnostics must be read
  that way, and the Worker TMPDIR is proved by the anonymous_token file.
- system-trust is iOS-only because the iOS esbuild plugin prepends
  ios-web-apis.cjs; plain (bundled) worker.cjs never emits it.

## M1 (in progress at the switch to CI)

- [x] Qt 6.12.0 Android + host kits installed (locally).
- [x] Minimal Qt Quick hello-world + Node shim configured.
- [ ] Debug APK produced by CI (path to be recorded here).
- [ ] S26 install/run: PENDING USER DEVICE TEST.
