// Android Worker wrapper (diag4).
// diag2 root cause (2026-10-27 S26): Worker thread on NodeMobile
// ignored the TMPDIR env forwarded via the Worker constructor, so
// os.tmpdir() in the Worker fell back to '/tmp', which an Android app
// cannot write -> EACCES opening '/tmp/anonymous_token', exit code 1.
// Main-thread runtime-env looked fine, which proved nothing about the
// Worker (Claude 2026-10-27 review, verified against this repo).
//
// diag4 changes, all inside the Worker, before requiring worker.cjs:
//  1. Log pre-assignment diagnostics (isMainThread, TMPDIR env, tmpdir,
//     homedir, cwd, uid) via process.stdout.write, NOT console.log:
//     worker.cjs silences console.* at require time, stdout survives.
//  2. Set process.env.TMPDIR = workerData.tmpdir.
//  3. Override require('node:os').tmpdir to return workerData.tmpdir.
//     This covers both hypotheses: env dropped (H1) and Worker tmpdir
//     lookup gated (H2), because worker.cjs and the bundled API all
//     call require('os').tmpdir() through the shared os module object.
//     Anything reading TMPDIR env directly or hardcoding a path is NOT
//     covered by the override; that is a recorded residual risk.
//  4. Log post-assignment tmpdir, then a write/read/delete test in
//     the tmpdir, then a dns.lookup + HTTPS GET preflight (5s cap each,
//     failures logged, never blocking worker.cjs).
//  5. Install an uncaughtException handler that writes to stdout.
// worker.cjs itself is NOT modified; new bridge files are: this wrapper,
// the Android runtime adapter, and the C++ shim (NodeBridge.cpp).
const { isMainThread, workerData } = require('node:worker_threads');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns');
const https = require('node:https');

function log(msg) {
    try { process.stdout.write(String(msg).slice(0, 200) + '\n'); } catch (_) {}
}
function uid() {
    try { return process.getuid(); } catch (_) { return 'n/a'; }
}

async function preflight(tmpdir) {
    log('diag4 pre isMain=' + isMainThread + ' envTMPDIR=' + (process.env.TMPDIR || 'null') + ' tmpdir=' + os.tmpdir() + ' home=' + os.homedir() + ' cwd=' + process.cwd() + ' uid=' + uid());
    if (tmpdir) {
        process.env.TMPDIR = tmpdir;
        try { os.tmpdir = () => tmpdir; } catch (e) { log('diag4 tmpdir override failed ' + e.message); }
        try { require('node:os').tmpdir = () => tmpdir; } catch (_) {}
    }
    log('diag4 post tmpdir=' + os.tmpdir() + ' envTMPDIR=' + (process.env.TMPDIR || 'null'));
    if (tmpdir) {
        try {
            const p = path.join(tmpdir, 'diag4-tmp-test');
            fs.writeFileSync(p, 'ok');
            const back = fs.readFileSync(p, 'utf-8');
            fs.unlinkSync(p);
            log('diag4 tmp write/read/delete ' + (back === 'ok' ? 'ok' : 'mismatch'));
        } catch (e) {
            log('diag4 tmp write/read/delete FAILED ' + e.message);
        }
    }
    try {
        const addrs = await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('dns timeout')), 5000);
            dns.lookup('interface.music.163.com', (err, address) => { clearTimeout(t); err ? reject(err) : resolve(address); });
        });
        log('diag4 dns.lookup interface.music.163.com=' + addrs);
    } catch (e) {
        log('diag4 dns.lookup FAILED ' + e.message);
    }
    try {
        const status = await new Promise((resolve, reject) => {
            const req = https.get('https://interface.music.163.com/', { timeout: 5000 }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
            req.on('timeout', () => { req.destroy(new Error('https timeout')); });
            req.on('error', reject);
        });
        log('diag4 https GET interface.music.163.com status=' + status);
    } catch (e) {
        log('diag4 https GET FAILED ' + e.message);
    }
}

process.on('uncaughtException', (err) => {
    log('diag4 uncaught ' + (err && err.message ? err.message : String(err)));
});

(async () => {
    if (!workerData || !workerData.script) {
        throw new Error('worker-wrapper: missing workerData.script');
    }
    await preflight(workerData.tmpdir);
    require(workerData.script);
})().catch((err) => {
    log('diag4 wrapper FAILED ' + (err && err.message ? err.message : String(err)));
    throw err;
});
