#!/bin/bash

echo "🚀 INITIATING MESSAPP MASTER BUILD SEQUENCE..."

# 1. Auto-detect environment
if command -v flatpak-spawn >/dev/null 2>&1; then
    PREFIX="flatpak-spawn --host"
    echo "🛡️ Flatpak Sandbox detected. Using host escape armor."
else
    PREFIX=""
    echo "💻 Standard Host Terminal detected. Running natively."
fi

# 2. Create the target directory
mkdir -p APPLICATION

# 3. Compile the master React/Vite frontend
echo "📦 Compiling React Frontend..."
$PREFIX npm run build

# 4. Linux Build
echo "🐧 Building Linux Native Apps (Tauri)..."
$PREFIX npx tauri build
echo "🚚 Exporting Linux installers..."
cp src-tauri/target/release/bundle/deb/*.deb APPLICATION/ 2>/dev/null
cp src-tauri/target/release/bundle/appimage/*.AppImage APPLICATION/ 2>/dev/null

# 5. Android Build
echo "📱 Building Android Mobile App (Capacitor)..."
$PREFIX npx cap sync
cd android
$PREFIX ./gradlew assembleDebug
cd ..
echo "🚚 Exporting Android APK..."
cp android/app/build/outputs/apk/debug/app-debug.apk APPLICATION/MessApp-Android.apk 2>/dev/null

# 6. Windows Build
echo "🪟 Building Windows Native Apps (Cross-Compile)..."
$PREFIX npx tauri build --target x86_64-pc-windows-gnu
echo "🚚 Exporting Windows installers..."
cp src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/*.exe APPLICATION/ 2>/dev/null
cp src-tauri/target/x86_64-pc-windows-gnu/release/bundle/msi/*.msi APPLICATION/ 2>/dev/null

echo "✅ ALL BUILDS COMPLETE!"
echo "📂 Check the 'APPLICATION' folder for your files."
ls -lh APPLICATION
