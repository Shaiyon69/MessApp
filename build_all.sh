#!/bin/bash

echo "🚀 INITIATING MESSAPP MASTER BUILD SEQUENCE..."

if command -v flatpak-spawn >/dev/null 2>&1; then
    PREFIX="flatpak-spawn --host"
    echo "🛡️ Flatpak Sandbox detected. Using host escape armor."
else
    PREFIX=""
    echo "💻 Standard Host Terminal detected. Running natively."
fi

mkdir -p APPLICATION

$PREFIX npm version patch --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "🏷️  New Version: $NEW_VERSION"

echo "📦 Compiling React Frontend..."
$PREFIX npm run build

echo "🐧 Building Linux Native Apps (Tauri)..."
$PREFIX npx tauri build
cp src-tauri/target/release/bundle/deb/*.deb APPLICATION/ 2>/dev/null
cp src-tauri/target/release/bundle/appimage/*.AppImage APPLICATION/ 2>/dev/null

echo "📱 Building Android Mobile App (Capacitor)..."
$PREFIX npx cap sync

GRADLE_FILE="android/app/build.gradle"
if [ -f "$GRADLE_FILE" ]; then
    if sed --version >/dev/null 2>&1; then
        sed -i -E "s/versionCode [0-9]+/versionCode $(date +%s)/" $GRADLE_FILE
        sed -i -E "s/versionName \".*\"/versionName \"$NEW_VERSION\"/" $GRADLE_FILE
    else
        sed -i '' -E "s/versionCode [0-9]+/versionCode $(date +%s)/" $GRADLE_FILE
        sed -i '' -E "s/versionName \".*\"/versionName \"$NEW_VERSION\"/" $GRADLE_FILE
    fi
fi

cd android
$PREFIX ./gradlew assembleDebug
cd ..

cp android/app/build/outputs/apk/debug/app-debug.apk APPLICATION/MessApp-Android-v$NEW_VERSION.apk 2>/dev/null

echo "🪟 Building Windows Native Apps (Cross-Compile)..."
$PREFIX npx tauri build --target x86_64-pc-windows-gnu
cp src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/*.exe APPLICATION/ 2>/dev/null
cp src-tauri/target/x86_64-pc-windows-gnu/release/bundle/msi/*.msi APPLICATION/ 2>/dev/null

echo "✅ ALL BUILDS COMPLETE!"
ls -lh APPLICATION