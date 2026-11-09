/**
 * AssetSchool Shared Types & Domain Models
 * Phase 01: Architectural Foundation
 */

export type UUID = string;

export enum SystemRole {
  SUPERADMIN = 'SUPERADMIN',
  INSTITUTION_ADMIN = 'INSTITUTION_ADMIN',
  TEACHER = 'TEACHER',
  TECH_SUPPORT = 'TECH_SUPPORT',
  STUDENT = 'STUDENT',
}

export enum DevicePlatform {
  WINDOWS = 'windows',
  MACOS = 'macos',
  LINUX = 'linux',
  CHROMEOS = 'chromeos',
}

export enum DeviceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy',
  LOCKED = 'locked',
  RESTRICTED = 'restricted',
}

export enum SessionStatus {
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
}

export enum CommandType {
  LOCK_SCREEN = 'LOCK_SCREEN',
  UNLOCK_SCREEN = 'UNLOCK_SCREEN',
  BLACKOUT_SCREEN = 'BLACKOUT_SCREEN',
  BROADCAST_START = 'BROADCAST_START',
  BROADCAST_STOP = 'BROADCAST_STOP',
  MUTE_AUDIO = 'MUTE_AUDIO',
  UNMUTE_AUDIO = 'UNMUTE_AUDIO',
  SEND_MESSAGE = 'SEND_MESSAGE',
  KILL_PROCESS = 'KILL_PROCESS',
  BLOCK_URL = 'BLOCK_URL',
  TRANSFER_FILE = 'TRANSFER_FILE',
  COLLECT_FILE = 'COLLECT_FILE',
  REBOOT = 'REBOOT',
  SHUTDOWN = 'SHUTDOWN',
  TAKE_ASSESSMENT = 'TAKE_ASSESSMENT',
  REQUEST_ASSISTANCE = 'REQUEST_ASSISTANCE',
  TELEMETRY_REQUEST = 'TELEMETRY_REQUEST',
}

export enum CommandStatus {
  PENDING = 'pending',
  DISPATCHED = 'dispatched',
  ACKNOWLEDGED = 'acknowledged',
  EXECUTED = 'executed',
  FAILED = 'failed',
  REJECTED = 'rejected',
}

export enum PolicyRuleType {
  WEB_FILTER = 'web_filter',
  APP_FILTER = 'app_filter',
  USB_STORAGE = 'usb_storage',
  SCREEN_PRIVACY = 'screen_privacy',
}

export interface Institution {
  id: UUID;
  code: string;
  name: string;
  description?: string;
  address?: string;
  contactEmail: string;
  settingsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: UUID;
  institutionId: UUID;
  email: string;
  firstName: string;
  lastName: string;
  role: SystemRole;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Classroom {
  id: UUID;
  institutionId: UUID;
  name: string;
  code: string;
  capacity: number;
  subnetLan?: string;
  broadcastIp?: string;
  isOnline: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Course {
  id: UUID;
  institutionId: UUID;
  code: string;
  name: string;
  description?: string;
  academicPeriod?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: UUID;
  institutionId: UUID;
  studentCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  assignedCourseId?: UUID;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: UUID;
  institutionId: UUID;
  hostname: string;
  macAddress: string;
  localIp: string;
  osType: DevicePlatform;
  osVersion: string;
  architecture: string;
  hardwareSerial?: string;
  status: DeviceStatus;
  enrolledAt: string;
  lastHeartbeatAt?: string;
  isRevoked: boolean;
  revocationReason?: string;
  currentClassroomId?: UUID;
  currentStudentId?: UUID;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceAgent {
  id: UUID;
  deviceId: UUID;
  agentVersion: string;
  protocolVersion: string;
  processPid?: number;
  startedAt?: string;
  publicKey?: string;
  connectionToken?: string;
  lastHandshakeAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceCapabilities {
  id: UUID;
  deviceId: UUID;
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
  platformNotes?: string;
  updatedAt: string;
}

export interface ClassroomSession {
  id: UUID;
  classroomId: UUID;
  teacherId: UUID;
  courseId?: UUID;
  title: string;
  startedAt: string;
  endedAt?: string;
  isActive: boolean;
  policySnapshot?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceSession {
  id: UUID;
  classroomSessionId: UUID;
  deviceId: UUID;
  studentId?: UUID;
  joinedAt: string;
  leftAt?: string;
  connectionQuality?: 'good' | 'fair' | 'poor';
  createdAt: string;
  updatedAt: string;
}

export interface Command {
  id: UUID;
  classroomSessionId?: UUID;
  deviceId: UUID;
  issuerUserId: UUID;
  commandType: CommandType;
  payloadJson: Record<string, unknown>;
  status: CommandStatus;
  resultJson?: Record<string, unknown>;
  issuedAt: string;
  executedAt?: string;
  errorDetails?: string;
}

export interface AuditLog {
  id: UUID;
  institutionId: UUID;
  actorUserId?: UUID;
  actorRole?: SystemRole;
  action: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  detailsJson: Record<string, unknown>;
  timestamp: string;
}

export interface Assessment {
  id: UUID;
  institutionId: UUID;
  creatorTeacherId: UUID;
  classroomSessionId?: UUID;
  title: string;
  durationMinutes: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: UUID;
  assessmentId: UUID;
  questionOrder: number;
  questionText: string;
  questionType: 'multiple_choice' | 'true_false' | 'short_answer';
  optionsJson: Array<{ id: string; text: string }>;
  points: number;
}

export interface AssessmentResult {
  id: UUID;
  assessmentId: UUID;
  studentId: UUID;
  deviceId: UUID;
  score: number;
  maxScore: number;
  answersJson: Record<string, unknown>;
  submittedAt: string;
}

export interface Policy {
  id: UUID;
  institutionId: UUID;
  name: string;
  description?: string;
  ruleType: PolicyRuleType;
  rulesJson: Record<string, unknown>;
  isEnforced: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationInventoryItem {
  id: UUID;
  deviceId: UUID;
  appName: string;
  appVersion?: string;
  publisher?: string;
  installDate?: string;
  binaryPath?: string;
  isRestricted: boolean;
  detectedAt: string;
}

export interface StoredFile {
  id: UUID;
  institutionId: UUID;
  uploaderUserId: UUID;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  storagePath: string;
  createdAt: string;
}

export interface DashboardStats {
  totalRegisteredDevices: number;
  connectedDevices: number;
  disconnectedDevices: number;
  availableClassrooms: number;
  activeSessions: number;
  serverStatus: {
    status: 'online' | 'degraded' | 'offline';
    uptimeSeconds: number;
    memoryUsageMb: number;
    version: string;
    nodeVersion: string;
  };
  lanStatus: {
    interfaceName: string;
    localIp: string;
    subnet: string;
    broadcastIp: string;
    multicastDiscoveryActive: boolean;
    activeAgentSockets: number;
  };
  recentEvents: Array<{
    id: UUID;
    timestamp: string;
    action: string;
    actor: string;
    details: string;
    severity: 'info' | 'warning' | 'error' | 'success';
  }>;
}
