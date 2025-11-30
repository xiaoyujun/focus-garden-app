#!/bin/bash
set -e

export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=$HOME/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

PROJECT_DIR="/mnt/c/Users/31927/Desktop/我开发的移动应用/focus-garden-app"
cd "$PROJECT_DIR/android"

chmod +x gradlew
./gradlew assembleRelease --no-daemon

echo "=== Build complete ==="
VERSION=$(node -p "require('../package.json').version")
APK_PATH=$(find . -name "*.apk" -path "*/release/*" | head -1)
echo "APK location: $APK_PATH"

# Copy to APK folder
mkdir -p "$PROJECT_DIR/APK"
cp "$APK_PATH" "$PROJECT_DIR/APK/focus-garden-v${VERSION}.apk"
echo "Copied to: APK/focus-garden-v${VERSION}.apk"
