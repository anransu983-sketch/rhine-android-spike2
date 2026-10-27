#pragma once
#include <QObject>
#include <QString>
#include <QTcpServer>
#include <QTcpSocket>
#include <QPointer>
#include <QUuid>

// M2 spike: reuses the iOS token handshake contract exactly, on Android.
//  Qt:  QTcpServer on localhost, ephemeral port, random UUID token.
//  Node: connects first, sends {"token": "<token>"} as its first line.
//  Qt:  aborts on mismatch, closes the server after auth, then sends
//       {"type":"start","session":"<uuid>","script":"<root>/MusicBridge/worker.cjs",
//        "env":{"TMPDIR":"<app-private tmp>"}}
//  Node runtime adapter (android-runtime.cjs, derived from ios-runtime.cjs
//  WITHOUT ios-system-trust / ios-web-apis) then spawns one Worker per
//  session, forwarding Worker stdout as {"type":"output",...base64} and
//  Worker stdin via {"type":"input",...base64}.
//  system-trust is iOS-only: plain worker.cjs never emits it (the iOS
//  plugin that prepends ios-web-apis.cjs is NOT used on Android), so
//  this class logs any system-trust message and does not answer it.
class NodeBridge : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)
    Q_PROPERTY(QString log READ log NOTIFY statusChanged)
public:
    explicit NodeBridge(QObject *parent = nullptr);
    QString status() const { return m_status; }
    QString log() const { return m_log; }

    // Extract APK assets (assets:/rhine-bridge, a copy of the bundled
    // bridge-build layout: MusicBridge/ + data/ + modules/) to app-private
    // storage and return the extracted root. Node cannot read from the APK.
    Q_INVOKABLE QString prepareBridge();
    // root: directory containing MusicBridge/ (extracted app-private dir).
    // tmpDir: app-private tmp dir passed as TMPDIR to the Worker.
    Q_INVOKABLE void start(const QString &root, const QString &tmpDir);
    // Send a raw JSON-line input message to the current session.
    Q_INVOKABLE void sendInput(const QString &jsonLine);
    // Local probe: /local/lyrics is pure-local (no NetEase network, no login)
    // and proves Worker + dispatch + stdin/stdout round-trip.
    Q_INVOKABLE void probeLocalLyrics();

signals:
    void statusChanged();

private:
    void setStatus(const QString &s);
    void appendLog(const QString &s);
    void launchNode(const QString &script, quint16 port, const QString &token);
    void onNewConnection();
    void onReadyRead();

    QTcpServer m_server;
    QPointer<QTcpSocket> m_socket;
    QString m_token;
    QString m_session;
    QString m_root;
    QString m_tmpDir;
    bool m_authenticated = false;
    bool m_launched = false;
    bool m_started = false;
    QByteArray m_input;
    QString m_status = "idle";
    QString m_log;
};
