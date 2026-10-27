// Android runtime adapter for the Rhine spike (M2).
// Derived from MusicBridge/ios-runtime.cjs, with iOS-only parts REMOVED:
//  - no ios-system-trust.cjs / ios-web-apis.cjs (plain worker.cjs never
//    emits system-trust; the iOS esbuild plugin that prepends ios-web-apis
//    is NOT used on Android, so Node's bundled CA store is used as-is).
//  - no iOS trust result handling: if a system-trust message ever arrives
//    from a Worker it is forwarded to Qt, which logs it and does NOT answer
//    (fail-visible, not silently trusted).
//
// Contract (same as iOS, see BridgeProcessIOS.cpp / NodeBridge.cpp):
//  argv: [prog, script, port, token]
//  Node connects to 127.0.0.1:port, first line {"token": "<token>"}.
//  Qt verifies the token, then sends {"type":"start","session":...,
//    "script":"<root>/MusicBridge/worker.cjs","env":{"TMPDIR":...}}.
//  Each session spawns one Worker with env {...process.env, ...message.env}
//  (this forwarding is REQUIRED: worker.cjs writes anonymous_token and
//  xeapi_public_key into os.tmpdir() at startup).
//  Worker stdout is forwarded as {"type":"output", data: base64};
//  Qt input is forwarded to Worker stdin as base64.
const net = require('node:net');
const os = require('node:os');
const readline = require('node:readline');
const { Worker } = require('node:worker_threads');

const socket = net.connect(Number(process.argv[2]), '127.0.0.1');
let worker;
let session;
let commands = Promise.resolve();

function send(message) {
    socket.write(JSON.stringify(message) + '\n');
}

socket.on('connect', () => send({ token: process.argv[3] }));
socket.on('error', () => {
    // Qt ended: stay silent, the host process reclaims the runtime.
});
setInterval(() => {}, 60000);

async function execute(message) {
    if (message.type === 'start') {
        if (worker) {
            await worker.terminate();
        }
        session = message.session;
        const current = session;
        // Spike diagnostic: prove TMPDIR / env propagation on both threads.
        send({
            type: 'runtime-env',
            session: current,
            tmpdir: os.tmpdir(),
            envTmpdir: process.env.TMPDIR || null,
            nodeVersion: process.version,
        });
        worker = new Worker(message.script, {
            env: { ...process.env, ...message.env },
            stdin: true,
            stdout: true,
            stderr: true,
        });
        const instance = worker;
        instance.on('message', (m) => {
            if (m?.type === 'system-trust') {
                send({ ...m, session: current });
            }
        });
        instance.stdout.on('data', (bytes) => {
            send({ type: 'output', session: current, data: bytes.toString('base64') });
        });
        // Spike change vs ios-runtime.cjs: ios-runtime discards stderr
        // (resume()), which hides Worker load errors completely. Forward
        // stderr as a diagnostic message instead; Qt logs it, never acts on it.
        instance.stderr.on('data', (bytes) => {
            send({ type: 'worker-stderr', session: current, data: bytes.toString('base64') });
        });
        instance.on('online', () => send({ type: 'started', session: current }));
        instance.on('error', () => send({ type: 'error', session: current }));
        instance.on('exit', () => {
            send({ type: 'finished', session: current });
            if (worker === instance) {
                worker = undefined;
            }
        });
        // Spike diagnostic: prove the Worker sees the forwarded env.
        // This is logged by the Worker itself via its stdout channel once
        // worker.cjs starts; the runtime-env message above covers the main
        // thread, and TMPDIR file creation covers the Worker thread.
    } else if (message.session === session && worker) {
        if (message.type === 'input') {
            worker.stdin.write(Buffer.from(message.data, 'base64'));
        } else if (message.type === 'stop') {
            await worker.terminate();
        }
        // NOTE: no system-trust-result handling on Android (iOS-only).
    }
}

readline.createInterface({ input: socket }).on('line', (line) => {
    commands = commands
        .then(() => execute(JSON.parse(line)))
        .catch(() => {
            send({ type: 'error', session });
        });
});
