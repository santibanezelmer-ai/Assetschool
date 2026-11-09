import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import {
  PacketType,
  ProtocolEnvelope,
  createEnvelope,
  AgentHelloPayload,
  ServerHelloAckPayload,
  CapabilitiesReportPayload,
} from '@assetschool/protocol';
import { ASSETSCHOOL_PROTOCOL_VERSION } from '@assetschool/protocol';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AgentGateway.name);
  private connectedAgents = new Map<string, { socketId: string; hostname: string; deviceId?: string }>();

  handleConnection(client: Socket) {
    this.logger.log(`Nuevo socket conectado desde ${client.handshake.address} (ID: ${client.id})`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Socket desconectado: ${client.id}`);
    this.connectedAgents.delete(client.id);
  }

  @SubscribeMessage(PacketType.AGENT_HELLO)
  handleAgentHello(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<AgentHelloPayload>,
  ): ProtocolEnvelope<ServerHelloAckPayload> {
    const payload = envelope.payload;
    this.logger.log(`AGENT_HELLO recibido de ${payload.hostname} (${payload.osType}) - MAC: ${payload.macAddress}`);

    this.connectedAgents.set(client.id, {
      socketId: client.id,
      hostname: payload.hostname,
      deviceId: payload.enrolledDeviceId,
    });

    const responsePayload: ServerHelloAckPayload = {
      serverTime: Date.now(),
      serverVersion: '1.0.0-phase1',
      institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      isEnrolled: Boolean(payload.enrolledDeviceId),
      assignedDeviceId: payload.enrolledDeviceId,
      heartbeatIntervalMs: 15000,
    };

    return createEnvelope(
      PacketType.SERVER_HELLO_ACK,
      'SERVER',
      'server',
      responsePayload,
    );
  }

  @SubscribeMessage(PacketType.HEARTBEAT_PING)
  handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<{ timestamp: number }>,
  ): ProtocolEnvelope<{ serverTime: number }> {
    return createEnvelope(
      PacketType.HEARTBEAT_PONG,
      'SERVER',
      'server',
      { serverTime: Date.now() },
    );
  }

  @SubscribeMessage(PacketType.CAPABILITIES_REPORT)
  handleCapabilities(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<CapabilitiesReportPayload>,
  ): ProtocolEnvelope<{ acknowledged: boolean }> {
    this.logger.log(`CAPABILITIES_REPORT recibido para dispositivo ${envelope.payload.deviceId} en ${envelope.payload.osType}`);
    return createEnvelope(
      PacketType.CAPABILITIES_ACK,
      'SERVER',
      'server',
      { acknowledged: true },
    );
  }

  getConnectedCount(): number {
    return this.connectedAgents.size;
  }
}
