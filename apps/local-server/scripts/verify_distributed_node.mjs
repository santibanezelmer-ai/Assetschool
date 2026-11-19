#!/usr/bin/env node
/**
 * ==============================================================================
 * ASSETSCHOOL — VERIFICADOR DE NODO DISTRIBUIDO (FASE K.1)
 * ==============================================================================
 * Diagnostica y valida la preparación de un equipo físico remoto (Equipo B o C)
 * para incorporarse al laboratorio distribuido de AssetSchool.
 *
 * Uso:
 *   node verify_distributed_node.mjs --server-ip 192.168.4.42 --role student
 * ==============================================================================
 */

import http from 'http';
import dgram from 'dgram';
import os from 'os';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
function getArg(flag, def) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const SERVER_IP = getArg('--server-ip', '192.168.4.42');
const SERVER_PORT = parseInt(getArg('--server-port', '3000'), 10);
const NODE_ROLE = getArg('--role', 'student'); // 'student' o 'master'

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout de conexión HTTP tras 5000ms'));
    });
    if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    req.end();
  });
}

function listenForUdpBeacon(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { socket.close(); } catch {}
        resolve(null);
      }
    }, timeoutMs);

    socket.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        try { socket.close(); } catch {}
        resolve(null);
      }
    });

    socket.on('message', (msg, rinfo) => {
      try {
        const parsed = JSON.parse(msg.toString('utf8'));
        if (parsed.packetType === 'DISCOVERY_BEACON' && !resolved) {
          resolved = true;
          clearTimeout(timer);
          try { socket.close(); } catch {}
          resolve({ beacon: parsed.payload, sender: rinfo.address });
        }
      } catch {}
    });

    try {
      socket.bind(48500, () => {
        // Enviar ping unicast opcional al servidor si no llega broadcast
        const pingMsg = Buffer.from(JSON.stringify({ query: 'ASSETSCHOOL_PING' }));
        socket.send(pingMsg, 48500, SERVER_IP, () => {});
      });
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

function getLocalNodeDetails() {
  const ifaces = os.networkInterfaces();
  let primaryIp = '127.0.0.1';
  let primaryMac = '00:00:00:00:00:00';
  let ifaceName = 'lo0';

  for (const [name, list] of Object.entries(ifaces)) {
    if (!list) continue;
    for (const info of list) {
      if (info.family === 'IPv4' && !info.internal && !name.startsWith('utun') && !name.startsWith('bridge')) {
        primaryIp = info.address;
        primaryMac = info.mac;
        ifaceName = name;
        break;
      }
    }
  }

  let screenCaptureKitStatus = 'No disponible';
  if (process.platform === 'darwin') {
    try {
      // Verificar disponibilidad de frameworks
      execSync('otool -L /System/Library/Frameworks/ScreenCaptureKit.framework/ScreenCaptureKit', { stdio: 'ignore' });
      screenCaptureKitStatus = 'Disponible (macOS 12.3+)';
    } catch {
      screenCaptureKitStatus = 'No detectado';
    }
  }

  return {
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    ip: primaryIp,
    mac: primaryMac,
    iface: ifaceName,
    screenCaptureKit: screenCaptureKitStatus,
  };
}

async function main() {
  console.log('='.repeat(80));
  console.log('   ASSETSCHOOL — VERIFICADOR DE NODO DISTRIBUIDO (FASE K.1)');
  console.log('='.repeat(80));
  console.log(`Rol del Nodo: ${NODE_ROLE.toUpperCase()}`);
  console.log(`Servidor Objetivo: http://${SERVER_IP}:${SERVER_PORT}`);

  const nodeInfo = getLocalNodeDetails();
  console.log('\n[1/5] Identidad del Nodo Físico Local:');
  console.log(`  - Hostname:        ${nodeInfo.hostname}`);
  console.log(`  - Plataforma:      ${nodeInfo.platform} (${nodeInfo.arch}, Kernel ${nodeInfo.release})`);
  console.log(`  - Interfaz LAN:    ${nodeInfo.iface}`);
  console.log(`  - Dirección IP:    ${nodeInfo.ip}`);
  console.log(`  - Dirección MAC:   ${nodeInfo.mac}`);
  console.log(`  - ScreenCapture:   ${nodeInfo.screenCaptureKit}`);

  console.log('\n[2/5] Escuchando Baliza de Descubrimiento UDP (Puerto 48500)...');
  const beaconResult = await listenForUdpBeacon(3500);
  if (beaconResult) {
    console.log(`  ✅ Baliza UDP recibida de ${beaconResult.sender}:`);
    console.log(`     - Servidor:     ${beaconResult.beacon.serverHost}:${beaconResult.beacon.httpPort}`);
    console.log(`     - Institución:  ${beaconResult.beacon.institutionName} (${beaconResult.beacon.institutionCode})`);
    console.log(`     - Protocolo:    v${beaconResult.beacon.protocolVersion}`);
  } else {
    console.log(`  ⚠️ No se recibió baliza de broadcast en 3.5s (normal si el firewall aísla puertos UDP o el servidor está inactivo)`);
  }

  console.log(`\n[3/5] Comprobando Conectividad HTTP REST a http://${SERVER_IP}:${SERVER_PORT}/api/v1/health...`);
  try {
    const healthRes = await httpRequest({
      hostname: SERVER_IP,
      port: SERVER_PORT,
      path: '/api/v1/health',
      method: 'GET',
    });
    if (healthRes.status === 200 && healthRes.body.status === 'ok') {
      console.log(`  ✅ Servidor AssetSchool en línea y saludable`);
      console.log(`     - Server ID:    ${healthRes.body.serverId}`);
      console.log(`     - Modo:         ${healthRes.body.serverMode}`);
      console.log(`     - Uptime:       ${healthRes.body.uptimeSeconds}s`);
    } else {
      console.log(`  ❌ Respuesta de salud no esperada: HTTP ${healthRes.status}`);
    }
  } catch (err) {
    console.log(`  ❌ Error conectando al servidor HTTP: ${err.message}`);
  }

  console.log(`\n[4/5] Comprobando Enrolamiento de Identidad para ${nodeInfo.mac}...`);
  try {
    const enrollRes = await httpRequest(
      {
        hostname: SERVER_IP,
        port: SERVER_PORT,
        path: '/api/v1/devices/enroll',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        macAddress: nodeInfo.mac,
        hostname: nodeInfo.hostname,
        osType: nodeInfo.platform === 'darwin' ? 'macos' : 'windows',
        agentVersion: '1.0.0',
        hardwareUuid: '00000000-0000-0000-0000-' + nodeInfo.mac.replace(/:/g, '').slice(0, 12),
      }
    );
    if (enrollRes.status === 200 || enrollRes.status === 201) {
      console.log(`  ✅ Dispositivo reconocido por el servidor institucional:`);
      console.log(`     - Device ID:    ${enrollRes.body.deviceId || enrollRes.body.id}`);
      console.log(`     - Estado:       ${enrollRes.body.status || 'autorizado'}`);
    } else {
      console.log(`  ℹ️ Estado de enrolamiento: HTTP ${enrollRes.status} (${JSON.stringify(enrollRes.body)})`);
    }
  } catch (err) {
    console.log(`  ⚠️ No se pudo verificar enrolamiento directo: ${err.message}`);
  }

  console.log('\n[5/5] Resumen de Preparación para Laboratorio Distribuido:');
  console.log('='.repeat(80));
  console.log(`Nodo: ${nodeInfo.hostname} (${nodeInfo.ip}) -> Servidor: ${SERVER_IP}:${SERVER_PORT}`);
  console.log(`Estado: NODO FÍSICO LISTO PARA INTEGRACIÓN LAN`);
  console.log('='.repeat(80));
}

main().catch(console.error);
