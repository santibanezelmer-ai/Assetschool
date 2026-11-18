#!/bin/bash
# Pre-install script for AssetSchool PKG installer
set -e

echo "[AssetSchool Pre-Install] Preparando sistema para instalación..."

# Si existe un LaunchDaemon previo del servidor o agente, descargarlo limpiamente
if launchctl list | grep -q "com.assetschool.server"; then
    echo "  -> Descargando LaunchDaemon com.assetschool.server..."
    launchctl bootout system /Library/LaunchDaemons/com.assetschool.server.plist 2>/dev/null || true
fi

if launchctl list | grep -q "com.assetschool.daemon"; then
    echo "  -> Descargando LaunchDaemon com.assetschool.daemon..."
    launchctl bootout system /Library/LaunchDaemons/com.assetschool.daemon.plist 2>/dev/null || true
fi

# Crear directorio institucional persistente con permisos adecuados
mkdir -p "/Library/Application Support/AssetSchool"
mkdir -p "/Library/Application Support/AssetSchool/logs"
mkdir -p "/Library/Application Support/AssetSchool/config"
chmod -R 775 "/Library/Application Support/AssetSchool"

echo "[AssetSchool Pre-Install] Finalizado con éxito."
exit 0
