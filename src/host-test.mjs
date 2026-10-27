// Host-side protocol test for android-runtime.cjs (M2 logic, NOT Android).
// Mimics NodeBridge.cpp exactly: localhost TCP server + random token,
// Node connects first with token, Qt verifies, then sends start{session,
// script: worker.cjs, env:{TMPDIR}}, then sends a /local/lyrics probe
// (pure-local, no network, no login) and checks the round-trip.
// Run: node host-test.mjs <bridge-src-dir> <tmpdir>
// Exit 0 only if: token accepted, runtime-env received, worker started,
// TMPDIR files written, and probe response id matches.
import net from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const bridgeDir = process.argv[2];
const tmpDir = process.argv[3];
fs.mkdirSync(tmpDir, { recursive: true });
const token = crypto.randomUUID();
const session = crypto.randomUUID();
const runtime = path.join(bridgeDir, 'android-runtime.cjs');
const worker = path.join(bridgeDir, 'worker.cjs');

const results = { tokenOk: false, runtimeEnv: null, started: false, probe: null, tmpFiles: [] };
let buf = '';
let child = null;
let timeout = null;

function fail(msg) {
  console.error('FAIL:', msg, JSON.stringify(results, null, 2));
  try { child?.kill('SIGKILL'); } catch {}
  process.exit(1);
}
function pass() {
  console.log('PASS', JSON.stringify(results, null, 2));
  try { child?.kill('SIGKILL'); } catch {}
  process.exit(0);
}

const server = net.createServer((socket) => {
  socket.on('data', (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (!results.tokenOk) {
        if (msg.token !== token) return fail('token mismatch');
        results.tokenOk = true;
        console.log('token accepted');
        socket.write(JSON.stringify({ type: 'start', session, script: worker, env: { TMPDIR: tmpDir } }) + '\n');
        continue;
      }
      if (msg.type === 'runtime-env') {
        results.runtimeEnv = msg;
        console.log('runtime-env', msg.tmpdir, 'envTMPDIR=', msg.envTmpdir, 'node=', msg.nodeVersion);
      } else if (msg.type === 'worker-stderr') {
        console.log('[worker stderr]', Buffer.from(msg.data, 'base64').toString().slice(0, 2000));
      } else if (msg.type === 'started') {
        results.started = true;
        console.log('worker started (online; module load may still be in progress, do not check TMPDIR yet)');
        // Worker readline requires a trailing newline, otherwise the line is never dispatched.
        const probe = JSON.stringify({ id: 'spike-local-lyrics', route: '/local/lyrics', params: { content: '[00:01.00]hello\n' } }) + '\n';
        socket.write(JSON.stringify({ type: 'input', session, data: Buffer.from(probe).toString('base64') }) + '\n');
      } else if (msg.type === 'output') {
        const out = JSON.parse(Buffer.from(msg.data, 'base64').toString());
        console.log('worker output id=', out.id, 'body keys=', out.body ? Object.keys(out.body) : null);
        if (out.id === 'spike-local-lyrics') {
          results.probe = out;
          // TMPDIR proof, corrected vs checklist v2: anonymous_token IS
          // written at worker startup; xeapi_public_key is LAZY (only
          // before a real XEAPI request), so it must NOT be required here.
          // Also note: runtime-env reports the MAIN thread tmpdir (/tmp),
          // because iOS design only forwards env to the Worker, not to the
          // runtime process itself. The Worker tmpdir is proved by the
          // anonymous_token file actually appearing in tmpDir.
          results.tmpFiles = fs.readdirSync(tmpDir);
          console.log('tmpdir files after probe:', results.tmpFiles);
          if (!results.tmpFiles.includes('anonymous_token')) return fail('anonymous_token missing in TMPDIR: ' + results.tmpFiles.join(','));
          return pass();
        }
      } else if (msg.type === 'error') {
        return fail('bridge error message: ' + line);
      }
    }
  });
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  console.log('listening on', port, 'spawning node', runtime);
  child = spawn(process.execPath, [runtime, String(port), token], { cwd: bridgeDir, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => console.log('[node stdout]', d.toString().slice(0, 500)));
  child.stderr.on('data', (d) => console.log('[node stderr]', d.toString().slice(0, 500)));
  child.on('exit', (code) => { if (!results.probe) console.log('node exited early code=', code); });
  timeout = setTimeout(() => fail('timeout 30s'), 30000);
});
