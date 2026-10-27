#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include "NodeBridge.h"

int main(int argc, char *argv[]) {
    QGuiApplication app(argc, argv);
    app.setApplicationName("RhineSpike");
    app.setOrganizationName("RhineSpike");
    QQmlApplicationEngine engine;
    NodeBridge bridge;
    engine.rootContext()->setContextProperty("nodeBridge", &bridge);
    // App-private dirs are resolved in QML via Qt's StandardPaths; the
    // bridge root/tmp are passed from QML on Start tap (M2) and are
    // no-ops on a desktop host build.
    const QUrl url(u"qrc:/qt/qml/RhineSpike/Main.qml"_qs);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed,
                     &app, []() { QCoreApplication::exit(-1); }, Qt::QueuedConnection);
    engine.load(url);
    return app.exec();
}
