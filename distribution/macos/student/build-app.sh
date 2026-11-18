#!/usr/bin/env bash
set -euo pipefail

# Build and package AssetSchool Student.app
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
OUTPUT_DIR="${REPO_ROOT}/dist/installers/macos"
APP_NAME="AssetSchool Student.app"
APP_BUNDLE="${OUTPUT_DIR}/${APP_NAME}"

echo "======================================================================"
echo "   ASSETSCHOOL — COMPILANDO BUNDLE MACOS (STUDENT.APP)               "
echo "======================================================================"

cd "${REPO_ROOT}/agents/macos-agent"
echo "[1/3] Compilando ejecutable Swift en modo Release..."
swift build -c release

RELEASE_BIN="${REPO_ROOT}/agents/macos-agent/.build/release/AssetSchoolAgent"
if [[ ! -f "${RELEASE_BIN}" ]]; then
    echo "ERROR: No se encontró el binario compilado en ${RELEASE_BIN}"
    exit 1
fi

echo "[2/3] Creando estructura del bundle .app..."
rm -rf "${APP_BUNDLE}"
mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources"
mkdir -p "${APP_BUNDLE}/Contents/Frameworks"

cp "${RELEASE_BIN}" "${APP_BUNDLE}/Contents/MacOS/AssetSchoolAgent"
cp "${SCRIPT_DIR}/Info.plist" "${APP_BUNDLE}/Contents/Info.plist"
echo "APPL????" > "${APP_BUNDLE}/Contents/PkgInfo"

# Copiar Frameworks dinámicos (WebRTC)
WEBRTC_FRAMEWORK="${REPO_ROOT}/agents/macos-agent/.build/checkouts/WebRTC/WebRTC.xcframework/macos-arm64_x86_64/WebRTC.framework"
if [[ -d "${WEBRTC_FRAMEWORK}" ]]; then
    echo "  -> Copiando WebRTC.framework a Contents/Frameworks..."
    cp -R "${WEBRTC_FRAMEWORK}" "${APP_BUNDLE}/Contents/Frameworks/"
fi

chmod +x "${APP_BUNDLE}/Contents/MacOS/AssetSchoolAgent"

echo "[3/3] Bundle generado exitosamente en:"
echo "  ✓ ${APP_BUNDLE}"
