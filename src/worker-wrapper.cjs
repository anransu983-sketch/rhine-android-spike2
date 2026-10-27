// Android Worker wrapper (diag3 fix).
// Root cause (2026-10-27 S26, diag2 log): Worker thread on NodeMobile
// ignored the TMPDIR env forwarded via the Worker constructor, so
// os.tmpdir() in the Worker fell back to '/tmp', which an Android app
// cannot write -> EACCES opening '/tmp/anonymous_token', exit code 1.
// The main thread's tmpdir was correct (/data/.../cache), which is why
// runtime-env looked fine while the Worker still crashed.
// Fix: set process.env.TMPDIR inside the Worker thread itself, BEFORE
// requiring worker.cjs. os.tmpdir() re-reads TMPDIR on every call, so
// worker.cjs and all @neteasecloudmusicapienhanced/api tmp paths then
// resolve to the app cache dir. workerData carries the script path and
// tmpdir; env forwarding is kept as a backup.
const { workerData } = require('node:worker_threads');
if (workerData && workerData.tmpdir) {
    process.env.TMPDIR = workerData.tmpdir;
}
if (workerData && workerData.script) {
    require(workerData.script);
} else {
    throw new Error('worker-wrapper: missing workerData.script');
}
