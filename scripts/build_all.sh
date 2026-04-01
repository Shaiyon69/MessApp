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
mkdir -p releases

# 3. Compile the master React/Vite frontend
echo "📦 Compiling React Frontend..."
$PREFIX npm run build

# 4. Linux Build
echo "🐧 Building Linux Native Apps (Tauri)..."
$PREFIX env CI=false npx tauri build
echo "🚚 Exporting Linux installers..."
cp src-tauri/target/release/bundle/deb/*.deb releases/ 2>/dev/null
cp src-tauri/target/release/bundle/appimage/*.AppImage releases/ 2>/dev/null

# 5. Android Build
echo "📱 Building Android Mobile App (Capacitor)..."
$PREFIX npx cap sync android
cd android
$PREFIX ./gradlew assembleRelease
cd ..
echo "🚚 Exporting Android APK..."
cp android/app/build/outputs/apk/release/app-release.apk releases/MessApp-Android.apk 2>/dev/null

# 6. Windows Build
echo "🪟 Building Windows Native Apps (Cross-Compile)..."
$PREFIX env CI=false npx tauri build --target x86_64-pc-windows-gnu
echo "🚚 Exporting Windows installers..."
cp src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/*.exe releases/ 2>/dev/null
cp src-tauri/target/x86_64-pc-windows-gnu/release/bundle/msi/*.msi releases/ 2>/dev/null

echo "✅ ALL BUILDS COMPLETE!"
echo "📂 Check the 'releases' folder for your files."
ls -lh releases
