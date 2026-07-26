#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Git Bash otherwise rewrites a Pages base path such as /MessApp/ into a
# Windows filesystem path when it launches npm.
export MSYS2_ENV_CONV_EXCL="${MSYS2_ENV_CONV_EXCL:+${MSYS2_ENV_CONV_EXCL};}VITE_BASE_PATH;VITE_SUPABASE_URL;VITE_SUPABASE_ANON_KEY"

TARGET="${1:-all}"
OUTPUT_DIR="${MESSAPP_OUTPUT_DIR:-APPLICATIONS}"
VERSION="$(node -p "require('./package.json').version")"

case "$TARGET" in
  all|web|android|windows|linux) ;;
  *)
    echo "Usage: ./build_all.sh [all|web|android|windows|linux]" >&2
    exit 2
    ;;
esac

if command -v flatpak-spawn >/dev/null 2>&1; then
  run_host() {
    flatpak-spawn --host "$@"
  }
else
  run_host() {
    "$@"
  }
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is unavailable: $1" >&2
    exit 1
  fi
}

copy_artifacts() {
  local destination_prefix="$1"
  shift
  local copied=0
  local pattern
  local artifact

  mkdir -p "$OUTPUT_DIR"
  for pattern in "$@"; do
    while IFS= read -r artifact; do
      [ -n "$artifact" ] || continue
      local extension="${artifact##*.}"
      cp "$artifact" "$OUTPUT_DIR/${destination_prefix}.${extension}"
      copied=$((copied + 1))
    done < <(compgen -G "$pattern" || true)
  done

  if [ "$copied" -eq 0 ]; then
    echo "No artifacts found for ${destination_prefix}" >&2
    exit 1
  fi
}

prepare_output_directory() {
  case "$OUTPUT_DIR" in
    ""|/*|[A-Za-z]:*|*..*)
      echo "MESSAPP_OUTPUT_DIR must be a relative directory inside the repository." >&2
      exit 1
      ;;
  esac

  mkdir -p "$OUTPUT_DIR"
  local resolved_output
  resolved_output="$(cd "$OUTPUT_DIR" && pwd -P)"
  case "$resolved_output" in
    "$ROOT_DIR"/*) ;;
    *)
      echo "Refusing to clean an output directory outside the repository." >&2
      exit 1
      ;;
  esac

  find "$resolved_output" -maxdepth 1 -type f \
    \( -name 'MessApp-*.AppImage' \
       -o -name 'MessApp-*.deb' \
       -o -name 'MessApp-*.exe' \
       -o -name 'MessApp-*.apk' \) \
    ! -name "MessApp-*-v${VERSION}.*" \
    -delete
}

build_web() {
  echo "Building MessApp web v${VERSION}"
  run_host npm run build
  test -f dist/index.html
}

build_linux() {
  require_command cargo
  echo "Building MessApp Linux v${VERSION}"
  run_host npx tauri build --bundles deb,appimage
  copy_artifacts \
    "MessApp-Linux-v${VERSION}" \
    "src-tauri/target/release/bundle/deb/*.deb" \
    "src-tauri/target/release/bundle/appimage/*.AppImage"
}

build_windows() {
  require_command cargo
  echo "Building MessApp Windows v${VERSION}"
  run_host npx tauri build --bundles nsis
  copy_artifacts \
    "MessApp-Windows-v${VERSION}" \
    "src-tauri/target/release/bundle/nsis/*.exe"
}

build_android() {
  require_command java
  echo "Building MessApp Android v${VERSION}"
  build_web
  run_host npx cap sync android
  (
    cd android
    run_host ./gradlew --no-daemon assembleDebug
  )
  test -f android/app/build/outputs/apk/debug/app-debug.apk
  mkdir -p "$OUTPUT_DIR"
  cp \
    android/app/build/outputs/apk/debug/app-debug.apk \
    "$OUTPUT_DIR/MessApp-Android-v${VERSION}.apk"
}

require_command node
require_command npm
prepare_output_directory

case "$TARGET" in
  web)
    build_web
    ;;
  android)
    build_android
    ;;
  windows)
    build_windows
    ;;
  linux)
    build_linux
    ;;
  all)
    build_web
    build_android
    case "$(uname -s)" in
      Linux*) build_linux ;;
      MINGW*|MSYS*|CYGWIN*) build_windows ;;
      *)
        echo "Desktop builds are supported on native Linux or Windows runners." >&2
        exit 1
        ;;
    esac
    ;;
esac

echo "MessApp ${TARGET} build completed successfully."
if [ -d "$OUTPUT_DIR" ]; then
  find "$OUTPUT_DIR" -maxdepth 1 -type f -print
fi
