#!/usr/bin/env bash
# ==============================================================================
# ASSETSCHOOL — GENERADOR OFICIAL DE INSTALADORES MACOS (.PKG Y .DMG)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUTPUT_DIR="${REPO_ROOT}/dist/installers/macos"
STAGING_DIR="${REPO_ROOT}/dist/staging/macos"

VERSION="1.2.0"
IDENTIFIER="com.assetschool.pkg"

echo "======================================================================"
echo "   ASSETSCHOOL — GENERADOR DE DISTRIBUCIÓN MACOS (.PKG / .DMG)       "
echo "======================================================================"

mkdir -p "${OUTPUT_DIR}"
mkdir -p "${STAGING_DIR}/root/Applications"
mkdir -p "${STAGING_DIR}/root/Library/LaunchAgents"
mkdir -p "${STAGING_DIR}/root/Library/LaunchDaemons"
mkdir -p "${STAGING_DIR}/root/Library/Application Support/AssetSchool/scripts"

# 1. Compilar y empaquetar aplicaciones
echo ""
echo "[1/5] Compilando bundles .app..."
"${SCRIPT_DIR}/master/build-app.sh"
"${SCRIPT_DIR}/student/build-app.sh"

echo ""
echo "[2/5] Preparando raíz del paquete de instalación..."
cp -R "${OUTPUT_DIR}/AssetSchool Master.app" "${STAGING_DIR}/root/Applications/"
cp -R "${OUTPUT_DIR}/AssetSchool Student.app" "${STAGING_DIR}/root/Applications/"
cp "${SCRIPT_DIR}/student/com.assetschool.student.plist" "${STAGING_DIR}/root/Library/LaunchAgents/"
cp "${SCRIPT_DIR}/student/com.assetschool.daemon.plist" "${STAGING_DIR}/root/Library/LaunchDaemons/"
cp "${SCRIPT_DIR}/server/com.assetschool.server.plist" "${STAGING_DIR}/root/Library/LaunchDaemons/"
cp "${SCRIPT_DIR}/scripts/tcc-permissions-helper.sh" "${STAGING_DIR}/root/Library/Application Support/AssetSchool/scripts/"
chmod +x "${STAGING_DIR}/root/Library/Application Support/AssetSchool/scripts/tcc-permissions-helper.sh"

# 2. Generar Component PKG con pkgbuild
echo ""
echo "[3/5] Creando paquete de componentes mediante pkgbuild..."
COMPONENT_PKG="${STAGING_DIR}/assetschool-core.pkg"

pkgbuild --root "${STAGING_DIR}/root" \
         --scripts "${SCRIPT_DIR}/scripts" \
         --identifier "${IDENTIFIER}.core" \
         --version "${VERSION}" \
         --install-location "/" \
         "${COMPONENT_PKG}"

# 3. Generar Distribution XML y Final Product PKG con productbuild
echo ""
echo "[4/5] Generando instalador final mediante productbuild..."
DIST_XML="${STAGING_DIR}/distribution.xml"
cat <<EOF > "${DIST_XML}"
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
    <title>AssetSchool Suite Multiplataforma</title>
    <organization>com.assetschool</organization>
    <options customize="never" require-scripts="false" hostArchitectures="arm64,x86_64"/>
    <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>
    <choices-outline>
        <line choice="choiceCore"/>
    </choices-outline>
    <choice id="choiceCore" title="AssetSchool Master &amp; Student Suite">
        <pkg-ref id="${IDENTIFIER}.core"/>
    </choice>
    <pkg-ref id="${IDENTIFIER}.core" version="${VERSION}" onConclusion="none">assetschool-core.pkg</pkg-ref>
</installer-gui-script>
EOF

FINAL_PKG="${OUTPUT_DIR}/AssetSchool-${VERSION}-macOS.pkg"
productbuild --distribution "${DIST_XML}" \
             --package-path "${STAGING_DIR}" \
             "${FINAL_PKG}"

echo "  ✓ PKG generado en: ${FINAL_PKG}"

# 4. Generar Imagen de Disco .DMG con hdiutil
echo ""
echo "[5/5] Creando imagen de disco .DMG para distribución..."
DMG_STAGING="${STAGING_DIR}/dmg"
rm -rf "${DMG_STAGING}"
mkdir -p "${DMG_STAGING}"
cp "${FINAL_PKG}" "${DMG_STAGING}/"
cp "${SCRIPT_DIR}/scripts/uninstall.sh" "${DMG_STAGING}/Desinstalar AssetSchool.command"
chmod +x "${DMG_STAGING}/Desinstalar AssetSchool.command"

# Enlace simbólico a /Applications
ln -s /Applications "${DMG_STAGING}/Aplicaciones"

FINAL_DMG="${OUTPUT_DIR}/AssetSchool-${VERSION}-macOS.dmg"
rm -f "${FINAL_DMG}"

hdiutil create -volname "AssetSchool ${VERSION}" \
               -srcfolder "${DMG_STAGING}" \
               -ov -format UDZO \
               "${FINAL_DMG}"

echo "  ✓ DMG generado en: ${FINAL_DMG}"

echo ""
echo "======================================================================"
echo "   DISTRIBUCIÓN MACOS GENERADA CON ÉXITO                             "
echo "   - PKG: ${FINAL_PKG}"
echo "   - DMG: ${FINAL_DMG}"
echo "======================================================================"
