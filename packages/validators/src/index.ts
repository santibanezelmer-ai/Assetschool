/**
 * AssetSchool Runtime Validation Schemas using Zod
 */

import { z } from 'zod';
import { CommandType, DevicePlatform, SystemRole } from '@assetschool/shared-types';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
});

export type ChangePasswordRequest = z.infer<typeof ChangePasswordSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenRequest = z.infer<typeof RefreshTokenSchema>;

export const RegisterUserSchema = z.object({
  institutionId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.nativeEnum(SystemRole),
});

export type RegisterUser = z.infer<typeof RegisterUserSchema>;

export const AgentRegistrationSchema = z.object({
  institutionCode: z.string().min(1),
  hostname: z.string().min(1),
  macAddress: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'Invalid MAC address'),
  localIp: z.string().ip(),
  osType: z.nativeEnum(DevicePlatform),
  osVersion: z.string(),
  architecture: z.string(),
  hardwareSerial: z.string().optional(),
  agentVersion: z.string(),
  publicKey: z.string().min(16),
  capabilities: z.object({
    canScreenBroadcast: z.boolean(),
    canScreenReceive: z.boolean(),
    canRemoteInput: z.boolean(),
    canLockInput: z.boolean(),
    canBlackoutScreen: z.boolean(),
    canFileTransfer: z.boolean(),
    canProcessBlock: z.boolean(),
    canUrlBlock: z.boolean(),
    canChat: z.boolean(),
    canExecuteCommand: z.boolean(),
    canCollectHardwareInventory: z.boolean(),
    platformNotes: z.string().optional(),
  }),
});

export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;

export const DispatchCommandSchema = z.object({
  classroomSessionId: z.string().uuid().optional(),
  deviceIds: z.array(z.string().uuid()).min(1),
  commandType: z.nativeEnum(CommandType),
  params: z.record(z.unknown()).default({}),
});

export type DispatchCommand = z.infer<typeof DispatchCommandSchema>;

export const CreateClassroomSchema = z.object({
  institutionId: z.string().uuid(),
  name: z.string().min(2),
  code: z.string().min(2),
  capacity: z.number().int().positive().max(200),
  subnetLan: z.string().optional(),
  broadcastIp: z.string().optional(),
});

export type CreateClassroom = z.infer<typeof CreateClassroomSchema>;
