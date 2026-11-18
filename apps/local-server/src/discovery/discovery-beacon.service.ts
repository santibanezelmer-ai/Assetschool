import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as dgram from 'node:dgram';
import * as os from 'node:os';
import {
  ASSETSCHOOL_PROTOCOL_VERSION,
  ASSETSCHOOL_LAN_DISCOVERY_PORT,
  PacketType,
  createEnvelope,
  DiscoveryBeaconPayload,
  ProtocolEnvelope,
} from '@assetschool/protocol';
import { DatabaseService } from '../database/database.service';
import { ServerIdentityService } from '../identity/server-identity.service';

@Injectable()
export class DiscoveryBeaconService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscoveryBeaconService.name);
  private socket: dgram.Socket | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private serverVersion = '1.0.0';
  private institutionInfo = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    code: 'CPC-01',
    name: 'Instituto Politécnico Central',
  };
  private beaconsSent = 0;
  private lastBeaconAt: number | null = null;
  private port = Number(process.env.PORT) || 3000;

  constructor(
    private readonly db: DatabaseService,
    private readonly identityService: ServerIdentityService,
  ) {}

  async onModuleInit() {
    await this.loadInstitutionInfo();
    this.startBeacon();
  }

  async onModuleDestroy() {
    this.stopBeacon();
  }

  private async loadInstitutionInfo() {
    try {
      const res = await this.db.query(
        'SELECT id, code, name FROM institutions ORDER BY created_at ASC LIMIT 1;',
      );
      if (res && res.rows && res.rows.length > 0) {
        this.institutionInfo = {
          id: res.rows[0].id,
          code: res.rows[0].code,
          name: res.rows[0].name,
        };
        this.identityService.setInstitutionId(res.rows[0].id);
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo cargar la institución de la base de datos, usando valor por defecto: ${(err as Error).message}`,
      );
    }
  }

  private getLanAddresses(): { address: string; broadcast: string }[] {
    const interfaces = os.networkInterfaces();
    const results: { address: string; broadcast: string }[] = [];

    // Optional override from environment
    if (process.env.ANNOUNCED_IP) {
      results.push({
        address: process.env.ANNOUNCED_IP,
        broadcast: '255.255.255.255',
      });
      return results;
    }

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const info of addrs) {
        if (info.family === 'IPv4' && !info.internal) {
          const ipParts = info.address.split('.').map(Number);
          const maskParts = (info.netmask || '255.255.255.0').split('.').map(Number);
          const bcastParts = ipParts.map((part, i) => (part | (~maskParts[i] & 255)) >>> 0);
          const broadcast = bcastParts.join('.');
          results.push({ address: info.address, broadcast });
        }
      }
    }

    if (results.length === 0) {
      results.push({ address: '127.0.0.1', broadcast: '127.255.255.255' });
    }

    return results;
  }

  private getPrimaryHost(): string {
    if (process.env.ANNOUNCED_IP) return process.env.ANNOUNCED_IP;
    const lans = this.getLanAddresses();
    return lans[0]?.address || '127.0.0.1';
  }

  private startBeacon() {
    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        this.logger.error(`Error en socket de baliza UDP: ${err.message}`, err.stack);
      });

      // Handle discovery queries from agents/masters on subnets
      this.socket.on('message', (msg, rinfo) => {
        try {
          const str = msg.toString('utf8');
          if (str.includes('DISCOVERY_QUERY') || str.includes('ASSETSCHOOL_PING')) {
            this.sendDirectBeacon(rinfo.address, rinfo.port);
          }
        } catch {
          // Ignore malformed packets
        }
      });

      this.socket.bind(ASSETSCHOOL_LAN_DISCOVERY_PORT, () => {
        if (!this.socket) return;
        try {
          this.socket.setBroadcast(true);
          const primaryHost = this.getPrimaryHost();
          const mode = this.identityService.getServerMode().toUpperCase();
          this.logger.log(
            `Descubrimiento LAN activo (Modo ${mode}) — Puerto UDP ${ASSETSCHOOL_LAN_DISCOVERY_PORT} (Host: ${primaryHost}:${this.port}, cada 3s)`,
          );

          // Emit immediately, then every 3000ms
          this.broadcast();
          this.intervalTimer = setInterval(() => this.broadcast(), 3000);
        } catch (err) {
          this.logger.error(`Error configurando broadcast en socket UDP: ${(err as Error).message}`);
        }
      });
    } catch (err) {
      this.logger.error(`Fallo al iniciar socket UDP de descubrimiento: ${(err as Error).message}`);
    }
  }

  public broadcast() {
    if (!this.socket) return;

    const messageBuffer = this.buildBeaconBuffer();
    const destinations = new Set<string>();

    destinations.add('255.255.255.255');
    destinations.add('127.0.0.1');

    for (const lan of this.getLanAddresses()) {
      if (lan.broadcast) destinations.add(lan.broadcast);
    }

    for (const dest of destinations) {
      try {
        this.socket.send(
          messageBuffer,
          0,
          messageBuffer.length,
          ASSETSCHOOL_LAN_DISCOVERY_PORT,
          dest,
          () => {},
        );
      } catch {
        // Suppress send errors on disabled broadcast routes
      }
    }

    this.beaconsSent++;
    this.lastBeaconAt = Date.now();
  }

  public sendDirectBeacon(targetHost: string, targetPort: number) {
    if (!this.socket) return;
    const buf = this.buildBeaconBuffer();
    try {
      this.socket.send(buf, 0, buf.length, targetPort, targetHost);
    } catch {
      // Ignored
    }
  }

  private buildBeaconBuffer(): Buffer {
    const primaryHost = this.getPrimaryHost();
    const now = Date.now();
    const serverId = this.identityService.getServerId();
    const mode = this.identityService.getServerMode();
    const fingerprint = this.identityService.getFingerprint();

    // Sign identity to prevent spoofing
    const signPayload = `${serverId}:${primaryHost}:${this.port}:${now}`;
    const signature = this.identityService.signPayload(signPayload);

    const payload: DiscoveryBeaconPayload & { serverMode: string; fingerprint: string; signature: string } = {
      serverId,
      serverVersion: this.serverVersion,
      protocolVersion: ASSETSCHOOL_PROTOCOL_VERSION,
      serverHost: primaryHost,
      httpPort: this.port,
      wsPort: this.port,
      wsPath: '/socket.io',
      wsUrl: `http://${primaryHost}:${this.port}/socket.io`,
      httpUrl: `http://${primaryHost}:${this.port}/api/v1`,
      institutionId: this.institutionInfo.id,
      institutionCode: this.institutionInfo.code,
      institutionName: this.institutionInfo.name,
      timestamp: now,
      serverMode: mode,
      fingerprint,
      signature,
    };

    const envelope = createEnvelope(
      PacketType.DISCOVERY_BEACON,
      serverId,
      'server',
      payload,
    );

    return Buffer.from(JSON.stringify(envelope));
  }

  public stopBeacon() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Socket already closed
      }
      this.socket = null;
    }
    this.logger.log('Servicio de descubrimiento LAN detenido.');
  }

  public getStatus() {
    return {
      active: this.socket !== null && this.intervalTimer !== null,
      port: ASSETSCHOOL_LAN_DISCOVERY_PORT,
      serverId: this.identityService.getServerId(),
      serverMode: this.identityService.getServerMode(),
      fingerprint: this.identityService.getFingerprint(),
      serverVersion: this.serverVersion,
      protocolVersion: ASSETSCHOOL_PROTOCOL_VERSION,
      institution: this.institutionInfo,
      beaconsSent: this.beaconsSent,
      lastBeaconAt: this.lastBeaconAt ? new Date(this.lastBeaconAt).toISOString() : null,
      primaryHost: this.getPrimaryHost(),
    };
  }
}
