#!/bin/bash
# Post-install script for AssetSchool PKG installer
set -e

echo "[AssetSchool Post-Install] Configurando servicios y permisos..."

# 1. Permisos de binarios en /Applications
if [[ -d "/Applications/AssetSchool Master.app" ]]; then
    chmod -R 755 "/Applications/AssetSchool Master.app"
fi

if [[ -d "/Applications/AssetSchool Student.app" ]]; then
    chmod -R 755 "/Applications/AssetSchool Student.app"
fi

# 2. Configurar LaunchDaemons si se instaló Server o Student Daemon
if [[ -f "/Library/LaunchDaemons/com.assetschool.server.plist" ]]; then
    chown root:wheel "/Library/LaunchDaemons/com.assetschool.server.plist"
    chmod 644 "/Library/LaunchDaemons/com.assetschool.server.plist"
    echo "  -> Cargando LaunchDaemon com.assetschool.server..."
    launchctl bootstrap system /Library/LaunchDaemons/com.assetschool.server.plist || true
fi

if [[ -f "/Library/LaunchDaemons/com.assetschool.daemon.plist" ]]; then
    chown root:wheel "/Library/LaunchDaemons/com.assetschool.daemon.plist"
    chmod 644 "/Library/LaunchDaemons/com.assetschool.daemon.plist"
    echo "  -> Cargando LaunchDaemon com.assetschool.daemon..."
    launchctl bootstrap system /Library/LaunchDaemons/com.assetschool.daemon.plist || true
fi

# 3. Configurar LaunchAgent de sesión de estudiante
if [[ -f "/Library/LaunchAgents/com.assetschool.student.plist" ]]; then
    chown root:wheel "/Library/LaunchAgents/com.assetschool.student.plist"
    chmod 644 "/Library/LaunchAgents/com.assetschool.student.plist"
    
    # Obtener ID de consola activa para cargar en la sesión del usuario actual
    CONSOLE_USER=$(stat -f "%Su" /dev/console)
    CONSOLE_UID=$(id -u "${CONSOLE_USER}" 2>/dev/null || echo "")
    if [[ -n "${CONSOLE_UID}" && "${CONSOLE_UID}" -ne 0 ]]; then
        echo "  -> Cargando LaunchAgent para el usuario activo '${CONSOLE_USER}' (UID ${CONSOLE_UID})..."
        launchctl asuser "${CONSOLE_UID}" launchctl bootstrap gui/"${CONSOLE_UID}" /Library/LaunchAgents/com.assetschool.student.plist 2>/dev/null || true
    fi
fi

# 4. Asistente de Permisos TCC (Screen Capture, Accessibility)
if [[ -x "/Library/Application Support/AssetSchool/scripts/tcc-permissions-helper.sh" ]]; then
    echo "  -> Verificando permisos de privacidad..."
    "/Library/Application Support/AssetSchool/scripts/tcc-permissions-helper.sh" --notify || true
fi

echo "[AssetSchool Post-Install] Instalación completada exitosamente."
exit 0
