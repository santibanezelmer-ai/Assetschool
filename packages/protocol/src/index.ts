/**
 * AssetSchool LAN Protocol Specification v1.0
 * Wire format, cryptographic envelope, and event schemas
 */

import { CommandType, DevicePlatform, DeviceStatus } from '@assetschool/shared-types';

export const ASSETSCHOOL_PROTOCOL_VERSION = '1.0.0';
export const ASSETSCHOOL_LAN_DISCOVERY_PORT = 48500;
export const ASSETSCHOOL_AGENT_WS_PORT = 48501;

export enum PacketType {
  // LAN Discovery
  DISCOVERY_BEACON = 'DISCOVERY_BEACON',

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

  // Screen Capture & WebRTC LAN Streaming (Phase 02 Specifications)
  SCREEN_CAPTURE_START = 'SCREEN_CAPTURE_START',
  SCREEN_CAPTURE_STOP = 'SCREEN_CAPTURE_STOP',
  SCREEN_CAPTURE_STATUS = 'SCREEN_CAPTURE_STATUS',
  WEBRTC_OFFER = 'WEBRTC_OFFER',
  WEBRTC_ANSWER = 'WEBRTC_ANSWER',
  WEBRTC_ICE_CANDIDATE = 'WEBRTC_ICE_CANDIDATE',
  WEBRTC_SESSION_CREATED = 'WEBRTC_SESSION_CREATED',
  WEBRTC_SESSION_CLOSED = 'WEBRTC_SESSION_CLOSED',
  WEBRTC_ERROR = 'WEBRTC_ERROR',
  SCREEN_STREAM_STATS = 'SCREEN_STREAM_STATS',

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
export interface DiscoveryBeaconPayload {
  serverId: string;
  serverVersion: string;
  protocolVersion: string;
  serverHost: string;
  httpPort: number;
  wsPort: number;
  wsPath: string;
  wsUrl: string;
  httpUrl: string;
  institutionId: string;
  institutionCode: string;
  institutionName: string;
  timestamp: number;
}

export function isDiscoveryBeaconPayload(data: unknown): data is DiscoveryBeaconPayload {
  if (!data || typeof data !== 'object') return false;
  const p = data as Record<string, unknown>;
  return (
    typeof p.serverId === 'string' &&
    typeof p.serverVersion === 'string' &&
    typeof p.protocolVersion === 'string' &&
    typeof p.httpPort === 'number' &&
    typeof p.wsPort === 'number' &&
    typeof p.institutionId === 'string' &&
    typeof p.timestamp === 'number'
  );
}

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

export interface LockScreenParams {
  teacherName: string;
  institutionName?: string;
  classroomName?: string;
  message?: string;
  lockInput?: boolean;
}

export interface UnlockScreenParams {
  teacherName: string;
  reason?: string;
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

// Phase 02: Screen Capture & WebRTC LAN Streaming Payloads
export interface ScreenCaptureStartPayload {
  teacherId: string;
  deviceId: string;
  sessionId: string;
  qualityTier: 'thumbnail' | 'individual';
  targetFps?: number;
  targetBitrateKbps?: number;
  targetWidth?: number;
  targetHeight?: number;
  monitorIndex?: number;
}

export interface ScreenCaptureStopPayload {
  teacherId: string;
  deviceId: string;
  sessionId: string;
  reason?: string;
}

export interface ScreenCaptureStatusPayload {
  deviceId: string;
  isCapturing: boolean;
  activeSessionId?: string;
  fps: number;
  width: number;
  height: number;
  qualityTier: 'thumbnail' | 'individual';
  error?: string;
}

export interface WebRtcOfferPayload {
  sessionId: string;
  targetDeviceId: string;
  teacherId: string;
  sdp: string;
  qualityTier?: 'thumbnail' | 'individual';
}

export interface WebRtcAnswerPayload {
  sessionId: string;
  deviceId: string;
  targetTeacherId: string;
  sdp: string;
}

export interface WebRtcIceCandidatePayload {
  sessionId: string;
  senderId: string;
  targetId: string;
  candidate: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

export interface WebRtcSessionCreatedPayload {
  sessionId: string;
  teacherId: string;
  deviceId: string;
  qualityTier: 'thumbnail' | 'individual';
  startedAt: number;
}

export interface WebRtcSessionClosedPayload {
  sessionId: string;
  teacherId: string;
  deviceId: string;
  reason: string;
  closedAt: number;
}

export interface WebRtcErrorPayload {
  sessionId?: string;
  deviceId?: string;
  teacherId?: string;
  code: 'PERMISSION_DENIED' | 'UNSUPPORTED_PLATFORM' | 'PEER_CONNECTION_FAILED' | 'REVOKED' | 'UNAUTHORIZED' | 'TIMEOUT' | 'UNKNOWN';
  message: string;
}

export interface ScreenStreamStatsPayload {
  sessionId: string;
  deviceId: string;
  fps: number;
  bitrateKbps: number;
  packetLossPercent: number;
  roundTripTimeMs: number;
  resolution: string;
  timestamp: number;
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
