#!/bin/bash
# ==============================================================================
# ASSETSCHOOL — SCRIPT DE DESINSTALACIÓN LIMPIA PARA MACOS
# ==============================================================================
set -e

if [[ $EUID -ne 0 ]]; then
   echo "ERROR: Este script debe ejecutarse como root (sudo ./uninstall.sh)"
   exit 1
fi

KEEP_DATA=0
for arg in "$@"; do
    case $arg in
        --keep-data)
            KEEP_DATA=1
            shift
            ;;
    esac
done

echo "======================================================================"
echo "   ASSETSCHOOL — DESINSTALACIÓN COMPLETA (MACOS)                     "
echo "======================================================================"

echo "[1/4] Deteniendo y descargando LaunchDaemons y LaunchAgents..."
if launchctl list | grep -q "com.assetschool.server"; then
    launchctl bootout system /Library/LaunchDaemons/com.assetschool.server.plist 2>/dev/null || true
fi
if launchctl list | grep -q "com.assetschool.daemon"; then
    launchctl bootout system /Library/LaunchDaemons/com.assetschool.daemon.plist 2>/dev/null || true
fi

CONSOLE_USER=$(stat -f "%Su" /dev/console)
CONSOLE_UID=$(id -u "${CONSOLE_USER}" 2>/dev/null || echo "")
if [[ -n "${CONSOLE_UID}" && "${CONSOLE_UID}" -ne 0 ]]; then
    launchctl asuser "${CONSOLE_UID}" launchctl bootout gui/"${CONSOLE_UID}" /Library/LaunchAgents/com.assetschool.student.plist 2>/dev/null || true
fi

echo "[2/4] Eliminando archivos de configuración de servicios de inicio..."
rm -f /Library/LaunchDaemons/com.assetschool.server.plist
rm -f /Library/LaunchDaemons/com.assetschool.daemon.plist
rm -f /Library/LaunchAgents/com.assetschool.student.plist

echo "[3/4] Eliminando aplicaciones de /Applications..."
rm -rf "/Applications/AssetSchool Master.app"
rm -rf "/Applications/AssetSchool Student.app"

echo "[4/4] Gestión de datos institucionales..."
if [[ ${KEEP_DATA} -eq 1 ]]; then
    echo "  ℹ Los datos y configuraciones en '/Library/Application Support/AssetSchool' han sido conservados."
else
    echo "  -> Eliminando datos y logs en '/Library/Application Support/AssetSchool'..."
    rm -rf "/Library/Application Support/AssetSchool"
fi

echo ""
echo "AssetSchool ha sido desinstalado correctamente del sistema macOS."
echo "======================================================================"
