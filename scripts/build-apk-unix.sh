#!/bin/bash
set -e

export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=$HOME/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

PROJECT_DIR="/mnt/k/我的小应用/APPzhuanzhu"
cd "$PROJECT_DIR"

echo "=== Installing npm dependencies ==="
npm install

echo "=== Building web assets ==="
npm run build

echo "=== Initializing Android project ==="
if [ ! -d "android" ]; then
    npx cap add android
fi

echo "=== Syncing Capacitor ==="
npx cap sync android

echo "=== Building APK ==="
cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon

echo "=== Build complete ==="
VERSION=$(node -p "require('../package.json').version")
APK_PATH=$(find . -name "*.apk" -path "*/debug/*" | head -1)
echo "APK location: $APK_PATH"

mkdir -p "$PROJECT_DIR/APK"
cp "$APK_PATH" "$PROJECT_DIR/APK/focus-garden-v${VERSION}.apk"
echo "Copied to: APK/focus-garden-v${VERSION}.apk"
