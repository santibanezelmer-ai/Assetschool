#!/usr/bin/env bash
# ==============================================================================
# ASSETSCHOOL SERVER INSTALLER & SERVICE PROVISIONER (MACOS / LINUX)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

MODE="LOCAL"
for arg in "$@"; do
    case $arg in
        --dedicated)
            MODE="DEDICATED"
            shift
            ;;
        --local)
            MODE="LOCAL"
            shift
            ;;
    esac
done

echo "======================================================================"
echo "   ASSETSCHOOL — INSTALADOR Y PROVISIONADOR DE SERVIDOR (${MODE})    "
echo "======================================================================"

# 1. Comprobar Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: Node.js 20+ no se encuentra instalado en el sistema."
    exit 1
fi
echo "[1/4] Entorno Node.js verificado: $(node -v)"

# 2. Compilar servidor si es necesario
if [[ ! -f "${REPO_ROOT}/apps/local-server/dist/main.js" ]]; then
    echo "[2/4] Compilando TypeScript de local-server..."
    cd "${REPO_ROOT}/apps/local-server"
    npm run build
else
    echo "[2/4] Binarios de local-server listos."
fi

# 3. Ejecutar aprovisionamiento (BD, Mediasoup, Identidad criptográfica)
echo "[3/4] Ejecutando aprovisionamiento técnico..."
node "${REPO_ROOT}/apps/local-server/scripts/assetschool-server-provisioner.mjs" "--${MODE,,}"

# 4. Registrar servicio LaunchDaemon en macOS si es root o mostrar instrucciones
echo "[4/4] Configuración de servicio del sistema..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLIST_SRC="${REPO_ROOT}/distribution/macos/server/com.assetschool.server.plist"
    PLIST_DEST="/Library/LaunchDaemons/com.assetschool.server.plist"
    if [[ $EUID -eq 0 ]]; then
        echo "  -> Copiando LaunchDaemon a ${PLIST_DEST}..."
        cp "${PLIST_SRC}" "${PLIST_DEST}"
        chown root:wheel "${PLIST_DEST}"
        chmod 644 "${PLIST_DEST}"
        launchctl bootout system "${PLIST_DEST}" 2>/dev/null || true
        launchctl bootstrap system "${PLIST_DEST}"
        echo "  ✓ LaunchDaemon activado y en ejecución automática."
    else
        echo "  ℹ Para ejecutar como servicio en segundo plano con inicio automático:"
        echo "    sudo cp \"${PLIST_SRC}\" \"${PLIST_DEST}\""
        echo "    sudo launchctl bootstrap system \"${PLIST_DEST}\""
    fi
fi

echo ""
echo "Instalación y aprovisionamiento del servidor completados."
echo "======================================================================"
