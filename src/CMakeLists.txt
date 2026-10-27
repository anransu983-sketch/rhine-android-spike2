cmake_minimum_required(VERSION 3.24)
project(RhineSpike VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

# Spike scope: Qt Quick hello-world (M1) + Node bridge shim (M2).
# No Qt private headers, no FSR, no Media3, no QQ/Kugou/YTM/local-music code.
find_package(Qt6 REQUIRED COMPONENTS Core Gui Qml Quick Network)

qt_standard_project_setup(REQUIRES 6.8)

qt_add_executable(RhineSpike
    main.cpp
    NodeBridge.cpp
    NodeBridge.h
)

qt_add_qml_module(RhineSpike
    URI RhineSpike
    VERSION 1.0
    QML_FILES Main.qml
)

target_link_libraries(RhineSpike PRIVATE
    Qt6::Core Qt6::Gui Qt6::Qml Qt6::Quick Qt6::Network
)

# Android package identity for the spike APK (sideload only, not Play).
if(ANDROID)
    set_property(TARGET RhineSpike PROPERTY QT_ANDROID_PACKAGE_NAME "com.suanran.rhinespike")
    set_property(TARGET RhineSpike PROPERTY QT_ANDROID_APP_NAME "RhineSpike")
    # Qt 6.12 floor is API 28; NodeMobile full zip requires API 24+.
    set_property(TARGET RhineSpike PROPERTY QT_ANDROID_MIN_SDK_VERSION 28)
    set_property(TARGET RhineSpike PROPERTY QT_ANDROID_TARGET_SDK_VERSION 36)
    set_property(TARGET RhineSpike PROPERTY QT_ANDROID_VERSION_CODE 1)
    set_property(TARGET RhineSpike PROPERTY QT_ANDROID_VERSION_NAME "0.1.0-spike")
    # Ship the bundled bridge as APK assets: src/android/assets/rhine-bridge/
    # is a copy of bridge-build/ (MusicBridge/ + data/ + modules/).
    set_property(TARGET RhineSpike PROPERTY QT_ANDROID_PACKAGE_SOURCE_DIR
                 ${CMAKE_CURRENT_SOURCE_DIR}/android)
endif()

# Android only: link the digidem NodeMobile libnode.so (arm64-v8a) and
# package it. The shim calls node::Start (C++ API, include/node/node.h),
# NOT a plain-C node_start symbol: the Android zip exports node::Start
# (mangled _ZN4node5StartEiPPc) and no node_start symbol (verified by nm -D).
# NODE_INCLUDE_DIR / NODE_LIB must point at the extracted digidem zip.
if(ANDROID)
    if(NOT DEFINED NODE_INCLUDE_DIR OR NOT DEFINED NODE_LIB)
        message(FATAL_ERROR "Android build requires -DNODE_INCLUDE_DIR=<digidem include> -DNODE_LIB=<digidem bin/arm64-v8a/libnode.so>")
    endif()
    # Both dirs are needed: <node/node.h> via include/, and quoted
    # includes like "v8config.h" (from cppgc/common.h) via include/node/.
    target_include_directories(RhineSpike PRIVATE
        ${NODE_INCLUDE_DIR} ${NODE_INCLUDE_DIR}/node)
    target_link_libraries(RhineSpike PRIVATE ${NODE_LIB})
    # Qt Android deployment: extra .so packaged into the APK.
    set_property(TARGET RhineSpike PROPERTY QT_ANDROID_EXTRA_LIBS ${NODE_LIB})
    # The Node runtime needs libc++_shared, which Qt already packages.
endif()

include(GNUInstallDirs)
install(TARGETS RhineSpike
    BUNDLE DESTINATION .
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)
