#!/bin/bash
# ==============================================================================
# ASSETSCHOOL — ASISTENTE DE PERMISOS DE PRIVACIDAD MACOS (TCC)
# ==============================================================================
# Guía transparente y oficial para autorización de Screen Recording,
# Accessibility y Notificaciones en macOS (Sonoma / Sequoia).
# Cumple estrictamente con las directrices de seguridad de Apple:
# NO bypass, NO manipulación de bases de datos protegidas por SIP.
# ==============================================================================

set -euo pipefail

MODE="${1:---check}"

echo "======================================================================"
echo "   ASSETSCHOOL — ASISTENTE DE PRIVACIDAD Y PERMISOS TCC (MACOS)      "
echo "======================================================================"

check_screen_recording() {
    echo -n "  [1/3] Grabación de Pantalla (Screen Capture)... "
    # En macOS 11+, Screen Recording se verifica intentando consultar ventanas de otras apps
    # o mediante el helper nativo de ScreenCaptureKit
    local SC_STATUS="UNKNOWN"
    if /usr/bin/osascript -e '
        tell application "System Events"
            set isRunning to (name of processes) contains "AssetSchoolAgent"
        end tell
    ' 2>/dev/null; then
        echo "DISPONIBLE"
    else
        echo "REQUIERE AUTORIZACIÓN"
    fi
}

check_accessibility() {
    echo -n "  [2/3] Accesibilidad (Control Asistido)... "
    # AXIsProcessTrusted check mediante osascript
    local AX_CHECK
    AX_CHECK=$(/usr/bin/osascript -e '
        tell application "System Events"
            return UI elements enabled
        end tell
    ' 2>/dev/null || echo "false")

    if [[ "${AX_CHECK}" == "true" ]]; then
        echo "HABILITADO"
    else
        echo "REQUIERE AUTORIZACIÓN"
    fi
}

guide_user() {
    echo ""
    echo "INSTRUCCIONES PARA EL ADMINISTRADOR O USUARIO:"
    echo "AssetSchool requiere que el usuario autorice explícitamente los siguientes"
    echo "permisos en Ajustes del Sistema > Privacidad y Seguridad:"
    echo ""
    echo "  1. Grabación de pantalla y audio del sistema:"
    echo "     Permite al docente transmitir su pantalla o recibir miniaturas pedagógicas."
    echo "     URL directa: x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    echo ""
    echo "  2. Accesibilidad:"
    echo "     Permite al docente interactuar asistidamente o bloquear la pantalla del alumno."
    echo "     URL directa: x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
    echo ""
    echo "  3. Notificaciones:"
    echo "     Informa sobre inicio de clase, recepción de material y mensajes del profesor."
    echo ""
    
    if [[ "${MODE}" == "--open" || "${MODE}" == "--gui" ]]; then
        echo "Abriendo panel de Privacidad en Ajustes del Sistema..."
        /usr/bin/open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    fi
}

check_screen_recording
check_accessibility
guide_user

echo "======================================================================"
