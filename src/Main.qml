import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: root
    visible: true
    width: 400
    height: 700
    title: "Rhine Spike M1+M2"

    // On Android, QStandardPaths gives app-private dirs. On desktop host
    // builds these are just placeholders; Node start is Android-only.
    property string bridgeRoot: StandardPaths.writableLocation(StandardPaths.AppDataLocation)
    property string tmpDir: StandardPaths.writableLocation(StandardPaths.CacheLocation)

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        Label {
            text: "Rhine Spike diag2"
            font.pixelSize: 28
            font.bold: true
        }
        Label {
            text: "M1: Qt Quick hello-world (this screen)  |  M2: Node bridge"
            wrapMode: Text.Wrap
        }
        Label {
            text: "Status: " + nodeBridge.status
            wrapMode: Text.Wrap
        }
        Button {
            text: "Prepare + Start Node bridge (M2)"
            onClicked: {
                var dst = nodeBridge.prepareBridge()
                nodeBridge.start(dst, root.tmpDir)
            }
        }
        Button {
            text: "Probe local lyrics (no network)"
            onClicked: nodeBridge.probeLocalLyrics()
        }
        ScrollView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            TextArea {
                text: nodeBridge.log
                readOnly: true
                wrapMode: Text.Wrap
            }
        }
        Label {
            text: "Pending S26 install verification: this APK has NOT been run on a device in this build environment."
            wrapMode: Text.Wrap
            font.italic: true
        }
    }
}
