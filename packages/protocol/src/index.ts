/**
 * AssetSchool LAN Protocol Specification v1.0
 * Wire format, cryptographic envelope, and event schemas
 */

import { CommandType, DevicePlatform, DeviceStatus } from '@assetschool/shared-types';

export const ASSETSCHOOL_PROTOCOL_VERSION = '1.0.0';
export const ASSETSCHOOL_LAN_DISCOVERY_PORT = 48500;
export const ASSETSCHOOL_AGENT_WS_PORT = 48501;

export enum PacketType {
  // Handshake & Registration
  AGENT_HELLO = 'AGENT_HELLO',
  SERVER_HELLO_ACK = 'SERVER_HELLO_ACK',
  AGENT_REGISTER_REQUEST = 'AGENT_REGISTER_REQUEST',
  AGENT_REGISTER_RESPONSE = 'AGENT_REGISTER_RESPONSE',

  // Health & Heartbeat
  HEARTBEAT_PING = 'HEARTBEAT_PING',
  HEARTBEAT_PONG = 'HEARTBEAT_PONG',

  // Capabilities
  CAPABILITIES_REPORT = 'CAPABILITIES_REPORT',
  CAPABILITIES_ACK = 'CAPABILITIES_ACK',

  // Telemetry & State
  TELEMETRY_SAMPLE = 'TELEMETRY_SAMPLE',
  STATE_CHANGE = 'STATE_CHANGE',

  // Command lifecycle
  COMMAND_DISPATCH = 'COMMAND_DISPATCH',
  COMMAND_ACK = 'COMMAND_ACK',
  COMMAND_RESULT = 'COMMAND_RESULT',

  // WebRTC Signaling (LAN Screen streaming)
  SIGNAL_SDP_OFFER = 'SIGNAL_SDP_OFFER',
  SIGNAL_SDP_ANSWER = 'SIGNAL_SDP_ANSWER',
  SIGNAL_ICE_CANDIDATE = 'SIGNAL_ICE_CANDIDATE',

  // Classroom Session binding
  SESSION_JOIN_NOTICE = 'SESSION_JOIN_NOTICE',
  SESSION_LEAVE_NOTICE = 'SESSION_LEAVE_NOTICE',
}

export interface SecuritySignature {
  algorithm: 'ED25519' | 'HMAC_SHA256';
  keyId: string;
  signatureHex: string;
}

export interface ProtocolEnvelope<T = unknown> {
  protocolVersion: string;
  packetId: string;
  packetType: PacketType;
  senderId: string; // Device UUID or 'SERVER'
  senderType: 'agent' | 'server';
  timestamp: number; // Unix epoch ms
  payload: T;
  security?: SecuritySignature;
}

// Payloads
export interface AgentHelloPayload {
  hostname: string;
  macAddress: string;
  localIp: string;
  osType: DevicePlatform;
  osVersion: string;
  architecture: string;
  agentVersion: string;
  publicKey: string;
  enrolledDeviceId?: string;
}

export interface ServerHelloAckPayload {
  serverTime: number;
  serverVersion: string;
  institutionId: string;
  isEnrolled: boolean;
  assignedDeviceId?: string;
  sessionToken?: string;
  heartbeatIntervalMs: number;
}

export interface CapabilitiesReportPayload {
  deviceId: string;
  osType: DevicePlatform;
  canScreenBroadcast: boolean;
  canScreenReceive: boolean;
  canRemoteInput: boolean;
  canLockInput: boolean;
  canBlackoutScreen: boolean;
  canFileTransfer: boolean;
  canProcessBlock: boolean;
  canUrlBlock: boolean;
  canChat: boolean;
  canExecuteCommand: boolean;
  canCollectHardwareInventory: boolean;
  platformNotes: string;
}

export interface TelemetrySamplePayload {
  deviceId: string;
  cpuUsagePercent: number;
  memoryUsageMb: number;
  freeDiskMb: number;
  activeWindowTitle?: string;
  networkLatencyMs?: number;
  batteryPercent?: number;
}

export interface CommandDispatchPayload {
  commandId: string;
  commandType: CommandType;
  issuedAt: number;
  params: Record<string, unknown>;
  requiresAck: boolean;
}

export interface CommandAckPayload {
  commandId: string;
  receivedAt: number;
  status: 'received' | 'executing';
}

export interface CommandResultPayload {
  commandId: string;
  completedAt: number;
  success: boolean;
  exitCode?: number;
  output?: string;
  error?: string;
}

export interface WebRtcSignalPayload {
  targetDeviceId: string;
  sessionToken: string;
  type: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: Record<string, unknown>;
}

export function createEnvelope<T>(
  packetType: PacketType,
  senderId: string,
  senderType: 'agent' | 'server',
  payload: T,
  packetId?: string
): ProtocolEnvelope<T> {
  return {
    protocolVersion: ASSETSCHOOL_PROTOCOL_VERSION,
    packetId: packetId ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `pkt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`),
    packetType,
    senderId,
    senderType,
    timestamp: Date.now(),
    payload,
  };
}
