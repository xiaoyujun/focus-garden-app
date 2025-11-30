#!/bin/bash
set -e

GRADLE_VERSION="8.11.1"
GRADLE_DIR="$HOME/.gradle/wrapper/dists/gradle-${GRADLE_VERSION}-all"
GRADLE_URL="https://mirrors.cloud.tencent.com/gradle/gradle-${GRADLE_VERSION}-all.zip"

mkdir -p "$GRADLE_DIR"
cd "$GRADLE_DIR"

# Create a random hash directory like Gradle does
HASH_DIR=$(echo -n "$GRADLE_URL" | md5sum | cut -d' ' -f1)
mkdir -p "$HASH_DIR"
cd "$HASH_DIR"

echo "Downloading Gradle ${GRADLE_VERSION} from Tencent mirror..."
wget -q --show-progress "$GRADLE_URL" -O "gradle-${GRADLE_VERSION}-all.zip"

echo "Extracting..."
unzip -q "gradle-${GRADLE_VERSION}-all.zip"

echo "Gradle downloaded and extracted successfully"
ls -la
