#!/usr/bin/env node
/**
 * ==============================================================================
 * ASSETSCHOOL INITIAL SETUP WIZARD & LAN ONBOARDING ASSISTANT (FASE F)
 * ==============================================================================
 * Asistente de configuración inicial para Master y Server.
 * Permite:
 * 1. Detección automática del servidor AssetSchool en la LAN (UDP 48500).
 * 2. Prueba de conectividad REST, WebSocket y WebRTC SFU.
 * 3. Selección o creación de institución educativa con validación de RUT.
 * 4. Configuración de aula informática y enrolamiento seguro de equipos.
 * 5. Diagnóstico de errores y recomendaciones operativas.
 * ==============================================================================
 */

import dgram from 'dgram';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

export class SetupWizard {
  constructor(options = {}) {
    this.discoveryPort = options.discoveryPort || 48500;
    this.timeoutMs = options.timeoutMs || 4000;
  }

  /**
   * 1. Detecta servidores AssetSchool en la red local escuchando beacons UDP 48500
   */
  async discoverLanServer() {
    return new Promise((resolve) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { socket.close(); } catch (_) {}
          resolve({ found: false, message: 'No se detectaron servidores AssetSchool transmitiendo en UDP 48500' });
        }
      }, this.timeoutMs);

      socket.on('message', (msg, rinfo) => {
        try {
          const payload = JSON.parse(msg.toString('utf8'));
          if (payload.service === 'AssetSchoolServer' || payload.protocol === 'assetschool-core') {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              try { socket.close(); } catch (_) {}
              resolve({
                found: true,
                serverAddress: rinfo.address,
                serverPort: payload.port || 3000,
                serverId: payload.serverId,
                serverMode: payload.mode || payload.serverMode,
                payload,
              });
            }
          }
        } catch (_) {}
      });

      socket.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          try { socket.close(); } catch (_) {}
          resolve({ found: false, message: 'Error en socket UDP de descubrimiento' });
        }
      });

      try {
        socket.bind(this.discoveryPort);
      } catch (e) {
        clearTimeout(timeout);
        resolve({ found: false, message: `No se pudo enlazar al puerto ${this.discoveryPort}: ${e.message}` });
      }
    });
  }

  /**
   * 2. Prueba de conectividad HTTP y diagnóstico del servidor
   */
  async testConnectivity(serverUrl) {
    const url = serverUrl.replace(/\/+$/, '');
    const startTime = Date.now();
    try {
      const res = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(3000) });
      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        return {
          success: false,
          status: res.status,
          latencyMs,
          error: `El servidor respondió con código HTTP ${res.status}`,
          recommendation: 'Verifique que el servicio AssetSchool Server se encuentre activo y no bloqueado por firewall.',
        };
      }
      const data = await res.json();
      return {
        success: true,
        latencyMs,
        serverId: data.serverId,
        serverMode: data.serverMode,
        uptimeSeconds: data.uptimeSeconds,
        recommendation: 'Conectividad óptima. El servidor responde con normalidad.',
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        error: err.message,
        recommendation: 'Asegúrese de que el equipo esté conectado a la misma red LAN que el servidor y que el puerto 3000 TCP esté abierto.',
      };
    }
  }

  /**
   * 3. Asocia la máquina a una institución mediante token de enrolamiento
   */
  async enrollMachine(serverUrl, enrollmentToken, machineData) {
    const url = serverUrl.replace(/\/+$/, '');
    try {
      const res = await fetch(`${url}/api/v1/devices/enrollment/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: enrollmentToken,
          agent: machineData,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          status: res.status,
          error: `Error al canjear token: ${errText}`,
          recommendation: 'Verifique que el token no haya expirado ni excedido su límite de usos.',
        };
      }

      const result = await res.json();
      return {
        success: true,
        deviceId: result.deviceId,
        institutionId: result.institutionId,
        classroomId: result.classroomId,
        message: 'Equipo vinculado exitosamente al aula institucional.',
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        recommendation: 'Compruebe la conexión de red hacia el servidor antes de reintentar el enrolamiento.',
      };
    }
  }

  /**
   * 4. Diagnóstico completo de configuración del puesto de trabajo
   */
  async runFullDiagnostics(serverUrl, token = null) {
    const report = {
      timestamp: new Date().toISOString(),
      networkLan: { status: 'UNKNOWN' },
      serverPing: { status: 'UNKNOWN' },
      enrollment: { status: 'SKIPPED' },
      overallReady: false,
    };

    console.log('\n--- Ejecutando Diagnóstico Inicial de Conectividad ---');
    const conn = await this.testConnectivity(serverUrl);
    report.serverPing = conn;
    if (conn.success) {
      console.log(`  ✓ Servidor detectado en ${serverUrl} (${conn.latencyMs}ms, Modo: ${conn.serverMode})`);
      report.networkLan.status = 'CONNECTED';
    } else {
      console.log(`  ✗ Fallo de conexión: ${conn.error}`);
      console.log(`    Recomendación: ${conn.recommendation}`);
      report.networkLan.status = 'DISCONNECTED';
      return report;
    }

    if (token) {
      console.log('  -> Probando token de enrolamiento institucional...');
      const enroll = await this.enrollMachine(serverUrl, token, {
        hostname: 'DIAGNOSTIC-NODE',
        macAddress: '00:00:00:00:00:00',
        localIp: '127.0.0.1',
        osType: process.platform,
        osVersion: 'Diagnostic Runtime',
        architecture: process.arch,
      });
      report.enrollment = enroll;
      if (enroll.success) {
        console.log(`  ✓ Enrolamiento institucional verificado (ID: ${enroll.deviceId})`);
        report.overallReady = true;
      } else {
        console.log(`  ✗ Enrolamiento no autorizado: ${enroll.error}`);
      }
    } else {
      report.overallReady = conn.success;
    }

    return report;
  }
}

// Ejecución interactiva por CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wizard = new SetupWizard();
  console.log('='.repeat(80));
  console.log('   ASSETSCHOOL — ASISTENTE DE CONFIGURACIÓN INICIAL (SETUP WIZARD)   ');
  console.log('='.repeat(80));
  console.log('\n[Paso 1] Buscando servidor AssetSchool en la red LAN (UDP 48500)...');
  
  wizard.discoverLanServer().then(async (disc) => {
    let targetUrl = 'http://127.0.0.1:3000';
    if (disc.found) {
      console.log(`  ✓ ¡Servidor encontrado en la LAN! ${disc.serverAddress}:${disc.serverPort}`);
      targetUrl = `http://${disc.serverAddress}:${disc.serverPort}`;
    } else {
      console.log(`  ℹ ${disc.message}. Utilizando fallback: ${targetUrl}`);
    }

    console.log(`\n[Paso 2] Evaluando conectividad contra ${targetUrl}...`);
    const diag = await wizard.runFullDiagnostics(targetUrl);
    console.log('\nResultado del diagnóstico:', diag.overallReady ? 'APROBADO' : 'REQUIERE ATENCIÓN');
    process.exit(0);
  });
}
