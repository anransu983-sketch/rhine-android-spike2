#include "NodeBridge.h"
#include <QCoreApplication>
#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QStandardPaths>
#include <QJsonObject>
#include <QThread>
#include <QTimer>

#ifdef Q_OS_ANDROID
// Android zip: include/node/node.h declares node::Start(int, char**).
// Include dir is the zip's include/ dir, so the path is <node/node.h>.
#include <node/node.h>
#endif

namespace {
QByteArray makeJsonLine(const QJsonObject &o) {
    return QJsonDocument(o).toJson(QJsonDocument::Compact) + '\n';
}
} // namespace

NodeBridge::NodeBridge(QObject *parent) : QObject(parent) {
    connect(&m_server, &QTcpServer::newConnection, this, &NodeBridge::onNewConnection);
}

void NodeBridge::setStatus(const QString &s) {
    if (m_status != s) { m_status = s; emit statusChanged(); }
    appendLog(QStringLiteral("STATUS: ") + s);
}

void NodeBridge::appendLog(const QString &s) {
    m_log += s + '\n';
    if (m_log.size() > 20000) m_log = m_log.right(20000);
    emit statusChanged();
}

QString NodeBridge::prepareBridge() {
    const QString dst = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)
                        + QStringLiteral("/rhine-bridge");
    QDirIterator it(QStringLiteral("assets:/rhine-bridge"),
                    QDir::Files, QDirIterator::Subdirectories);
    int copied = 0;
    while (it.hasNext()) {
        const QString srcPath = it.next();
        QString rel = srcPath;
        rel.remove(QStringLiteral("assets:/rhine-bridge/"));
        const QString dstPath = dst + QLatin1Char('/') + rel;
        QDir().mkpath(QFileInfo(dstPath).absolutePath());
        QFile::remove(dstPath);
        if (QFile::copy(srcPath, dstPath)) ++copied;
    }
    appendLog(QStringLiteral("prepareBridge: copied ") + QString::number(copied)
              + QStringLiteral(" files to ") + dst);
    return dst;
}

void NodeBridge::start(const QString &root, const QString &tmpDir) {
    m_root = root;
    m_tmpDir = tmpDir;
    m_session = QUuid::createUuid().toString(QUuid::WithoutBraces);
    m_token = QUuid::createUuid().toString(QUuid::WithoutBraces);
    const QString script = root + QStringLiteral("/MusicBridge/android-runtime.cjs");
    if (!QFileInfo::exists(script)) {
        setStatus(QStringLiteral("missing android-runtime.cjs: ") + script);
        return;
    }
    if (!m_server.listen(QHostAddress::LocalHost, 0)) {
        setStatus(QStringLiteral("QTcpServer listen failed"));
        return;
    }
    setStatus(QStringLiteral("server listening, launching Node..."));
    launchNode(script, m_server.serverPort(), m_token);
}

void NodeBridge::launchNode(const QString &script, quint16 port, const QString &token) {
    if (m_launched) return;
    m_launched = true;
#ifdef Q_OS_ANDROID
    // Dedicated thread, never the GUI thread; node::Start blocks until exit.
    // Note: argv must stay alive for the whole runtime lifetime, hence the
    // heap-allocated QByteArrays captured by the thread lambda.
    auto *scriptB = new QByteArray(script.toUtf8());
    auto *portB = new QByteArray(QByteArray::number(port));
    auto *tokenB = new QByteArray(token.toUtf8());
    auto *progB = new QByteArray("node");
    QThread *thread = QThread::create([=]() {
        // node::Start expects: argv[0]=prog, argv[1]=script, argv[2]=port, argv[3]=token
        char *argv[4];
        argv[0] = progB->data();
        argv[1] = scriptB->data();
        argv[2] = portB->data();
        argv[3] = tokenB->data();
        int rc = node::Start(4, argv);
        Q_UNUSED(rc);
        // Intentionally leak argv buffers: Node may keep them alive.
    });
    thread->start();
    QTimer::singleShot(30000, this, [this]() {
        if (!m_authenticated) setStatus(QStringLiteral("TIMEOUT: Node did not authenticate in 30s"));
    });
#else
    Q_UNUSED(script); Q_UNUSED(port); Q_UNUSED(token);
    setStatus(QStringLiteral("node::Start is Android-only in this spike (host build has no libnode)"));
#endif
}

void NodeBridge::onNewConnection() {
    auto *candidate = m_server.nextPendingConnection();
    if (m_socket) { candidate->abort(); candidate->deleteLater(); return; }
    m_socket = candidate;
    connect(m_socket, &QTcpSocket::readyRead, this, &NodeBridge::onReadyRead);
    connect(m_socket, &QTcpSocket::disconnected, this, [this]() {
        setStatus(QStringLiteral("node socket disconnected"));
    });
}

void NodeBridge::onReadyRead() {
    m_input += m_socket->readAll();
    if (m_input.size() > 48 * 1024 * 1024) { m_socket->abort(); return; }
    qsizetype end;
    while ((end = m_input.indexOf('\n')) >= 0) {
        QByteArray line = m_input.left(end);
        m_input.remove(0, end + 1);
        QJsonDocument doc = QJsonDocument::fromJson(line);
        if (!doc.isObject()) continue;
        QJsonObject msg = doc.object();
        if (!m_authenticated) {
            if (msg.value(QStringLiteral("token")).toString() != m_token) {
                m_socket->abort();
                setStatus(QStringLiteral("TOKEN MISMATCH: connection aborted"));
                return;
            }
            m_authenticated = true;
            m_server.close();
            setStatus(QStringLiteral("authenticated; sending start"));
            QJsonObject env;
            env.insert(QStringLiteral("TMPDIR"), m_tmpDir);
            QJsonObject start;
            start.insert(QStringLiteral("type"), QStringLiteral("start"));
            start.insert(QStringLiteral("session"), m_session);
            start.insert(QStringLiteral("script"), m_root + QStringLiteral("/MusicBridge/worker.cjs"));
            start.insert(QStringLiteral("env"), env);
            m_socket->write(makeJsonLine(start));
            continue;
        }
        const QString type = msg.value(QStringLiteral("type")).toString();
        if (type == QStringLiteral("runtime-env")) {
            appendLog(QStringLiteral("runtime-env tmpdir=") + msg.value(QStringLiteral("tmpdir")).toString()
                      + QStringLiteral(" envTMPDIR=") + msg.value(QStringLiteral("envTmpdir")).toString()
                      + QStringLiteral(" node=") + msg.value(QStringLiteral("nodeVersion")).toString());
        } else if (type == QStringLiteral("started")) {
            m_started = true;
            setStatus(QStringLiteral("worker started"));
            // TMPDIR proof is done by the UI/host: worker.cjs writes
            // anonymous_token + xeapi_public_key into TMPDIR at startup.
            appendLog(QStringLiteral("worker started; check TMPDIR files"));
        } else if (type == QStringLiteral("worker-stderr")) {
            QByteArray raw = QByteArray::fromBase64(msg.value(QStringLiteral("data")).toString().toLatin1());
            appendLog(QStringLiteral("worker stderr: ") + QString::fromUtf8(raw).left(500));
        } else if (type == QStringLiteral("output")) {
            QByteArray raw = QByteArray::fromBase64(msg.value(QStringLiteral("data")).toString().toLatin1());
            appendLog(QStringLiteral("worker output: ") + QString::fromUtf8(raw).left(500));
        } else if (type == QStringLiteral("finished")) {
            appendLog(QStringLiteral("worker finished code=") + msg.value(QStringLiteral("code")).toVariant().toString());
        } else if (type == QStringLiteral("system-trust")) {
            // iOS-only path; plain worker.cjs must never emit this.
            appendLog(QStringLiteral("UNEXPECTED system-trust message (iOS-only, not answered)"));
        } else if (type == QStringLiteral("error") || type == QStringLiteral("runtime-error")) {
            setStatus(QStringLiteral("bridge error: ") + QString::fromUtf8(line));
        }
    }
}

void NodeBridge::sendInput(const QString &jsonLine) {
    if (!m_socket || !m_authenticated) return;
    // Worker reads stdin with readline: the line MUST end with '\n',
    // otherwise it is buffered forever and never dispatched. This is a
    // protocol requirement the checklist does not spell out.
    QByteArray data = jsonLine.toUtf8();
    if (!data.endsWith('\n')) data += '\n';
    QJsonObject o;
    o.insert(QStringLiteral("type"), QStringLiteral("input"));
    o.insert(QStringLiteral("session"), m_session);
    o.insert(QStringLiteral("data"), QString::fromLatin1(data.toBase64()));
    m_socket->write(makeJsonLine(o));
}

void NodeBridge::probeLocalLyrics() {
    if (!m_started) { setStatus(QStringLiteral("probe: worker not started yet")); return; }
    // Pure-local route in worker.cjs: no network, no login.
    sendInput(QStringLiteral("{\"id\":\"spike-local-lyrics\",\"route\":\"/local/lyrics\",\"params\":{\"content\":\"[00:01.00]hello\\n\"}}"));
}
