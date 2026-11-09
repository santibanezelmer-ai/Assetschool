#!/usr/bin/env bash
# ==============================================================================
# AssetSchool LAN TLS Certificate Generator
# Generates a self-signed Root CA and Server certificate for local LAN deployment
# ==============================================================================

set -euo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "${CERT_DIR}/output"
cd "${CERT_DIR}/output"

LAN_IP="${1:-192.168.1.100}"
DOMAIN="${2:-assetschool.lan}"

echo "Generating Root CA..."
openssl req -x509 -nodes -new -sha256 -days 3650 -newkey rsa:2048 \
  -keyout assetschool-ca.key \
  -out assetschool-ca.crt \
  -subj "/C=CL/ST=Valparaiso/O=AssetSchool/CN=AssetSchool Local Root CA"

echo "Generating Server Key & CSR..."
openssl req -new -nodes -newkey rsa:2048 \
  -keyout assetschool-server.key \
  -out assetschool-server.csr \
  -subj "/C=CL/ST=Valparaiso/O=AssetSchool/CN=${DOMAIN}"

cat <<EOF > server-ext.cnf
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${DOMAIN}
DNS.2 = localhost
IP.1 = ${LAN_IP}
IP.2 = 127.0.0.1
EOF

echo "Signing Server Certificate with Root CA..."
openssl x509 -req -sha256 -days 825 -in assetschool-server.csr \
  -CA assetschool-ca.crt -CAkey assetschool-ca.key -CAcreateserial \
  -out assetschool-server.crt -extfile server-ext.cnf

echo "Certificates successfully generated in ${CERT_DIR}/output"
ls -la
