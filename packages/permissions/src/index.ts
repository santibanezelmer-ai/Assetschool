/**
 * AssetSchool RBAC Permission Matrix & Authorization Utilities
 */

import { SystemRole } from '@assetschool/shared-types';

export enum PermissionKey {
  // Institutions & Users
  INSTITUTION_VIEW = 'institution:view',
  INSTITUTION_MANAGE = 'institution:manage',
  USER_VIEW = 'user:view',
  USER_CREATE = 'user:create',
  USER_EDIT = 'user:edit',
  USER_DELETE = 'user:delete',

  // Classrooms & Courses
  CLASSROOM_VIEW = 'classroom:view',
  CLASSROOM_MANAGE = 'classroom:manage',
  COURSE_VIEW = 'course:view',
  COURSE_MANAGE = 'course:manage',

  // Classroom Live Monitoring & Control
  SESSION_START = 'session:start',
  SESSION_END = 'session:end',
  DEVICE_MONITOR = 'device:monitor',
  DEVICE_CONTROL = 'device:control',
  DEVICE_LOCK = 'device:lock',
  DEVICE_BROADCAST = 'device:broadcast',
  DEVICE_FILE_TRANSFER = 'device:file_transfer',
  DEVICE_COMMAND_DISPATCH = 'device:command_dispatch',

  // Policies & Security
  POLICY_VIEW = 'policy:view',
  POLICY_APPLY = 'policy:apply',
  POLICY_MANAGE = 'policy:manage',
  DEVICE_ENROLL = 'device:enroll',
  DEVICE_REVOKE = 'device:revoke',

  // Assessments
  ASSESSMENT_VIEW = 'assessment:view',
  ASSESSMENT_CREATE = 'assessment:create',
  ASSESSMENT_LAUNCH = 'assessment:launch',
  ASSESSMENT_GRADE = 'assessment:grade',

  // Audit & Telemetry
  AUDIT_VIEW = 'audit:view',
  TIC_INVENTORY_VIEW = 'inventory:view',
  TIC_INVENTORY_MANAGE = 'inventory:manage',
  REPORTS_VIEW = 'reports:view',
  SYSTEM_CONFIG = 'system:config',
}

export const ROLE_PERMISSIONS: Record<SystemRole, PermissionKey[]> = {
  [SystemRole.SUPERADMIN]: Object.values(PermissionKey),

  [SystemRole.INSTITUTION_ADMIN]: [
    PermissionKey.INSTITUTION_VIEW,
    PermissionKey.USER_VIEW,
    PermissionKey.USER_CREATE,
    PermissionKey.USER_EDIT,
    PermissionKey.USER_DELETE,
    PermissionKey.CLASSROOM_VIEW,
    PermissionKey.CLASSROOM_MANAGE,
    PermissionKey.COURSE_VIEW,
    PermissionKey.COURSE_MANAGE,
    PermissionKey.SESSION_START,
    PermissionKey.SESSION_END,
    PermissionKey.DEVICE_MONITOR,
    PermissionKey.DEVICE_CONTROL,
    PermissionKey.DEVICE_LOCK,
    PermissionKey.DEVICE_BROADCAST,
    PermissionKey.DEVICE_FILE_TRANSFER,
    PermissionKey.DEVICE_COMMAND_DISPATCH,
    PermissionKey.POLICY_VIEW,
    PermissionKey.POLICY_APPLY,
    PermissionKey.POLICY_MANAGE,
    PermissionKey.DEVICE_ENROLL,
    PermissionKey.DEVICE_REVOKE,
    PermissionKey.ASSESSMENT_VIEW,
    PermissionKey.ASSESSMENT_CREATE,
    PermissionKey.ASSESSMENT_LAUNCH,
    PermissionKey.ASSESSMENT_GRADE,
    PermissionKey.AUDIT_VIEW,
    PermissionKey.TIC_INVENTORY_VIEW,
    PermissionKey.TIC_INVENTORY_MANAGE,
    PermissionKey.REPORTS_VIEW,
    PermissionKey.SYSTEM_CONFIG,
  ],

  [SystemRole.TEACHER]: [
    PermissionKey.CLASSROOM_VIEW,
    PermissionKey.COURSE_VIEW,
    PermissionKey.SESSION_START,
    PermissionKey.SESSION_END,
    PermissionKey.DEVICE_MONITOR,
    PermissionKey.DEVICE_CONTROL,
    PermissionKey.DEVICE_LOCK,
    PermissionKey.DEVICE_BROADCAST,
    PermissionKey.DEVICE_FILE_TRANSFER,
    PermissionKey.DEVICE_COMMAND_DISPATCH,
    PermissionKey.POLICY_VIEW,
    PermissionKey.POLICY_APPLY,
    PermissionKey.ASSESSMENT_VIEW,
    PermissionKey.ASSESSMENT_CREATE,
    PermissionKey.ASSESSMENT_LAUNCH,
    PermissionKey.ASSESSMENT_GRADE,
    PermissionKey.REPORTS_VIEW,
  ],

  [SystemRole.TECH_SUPPORT]: [
    PermissionKey.CLASSROOM_VIEW,
    PermissionKey.DEVICE_MONITOR,
    PermissionKey.DEVICE_CONTROL,
    PermissionKey.DEVICE_ENROLL,
    PermissionKey.DEVICE_REVOKE,
    PermissionKey.TIC_INVENTORY_VIEW,
    PermissionKey.TIC_INVENTORY_MANAGE,
    PermissionKey.AUDIT_VIEW,
    PermissionKey.SYSTEM_CONFIG,
  ],

  [SystemRole.STUDENT]: [
    PermissionKey.CLASSROOM_VIEW,
    PermissionKey.COURSE_VIEW,
    PermissionKey.ASSESSMENT_VIEW,
  ],
};

export function hasPermission(role: SystemRole, permission: PermissionKey): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

export function hasAnyPermission(role: SystemRole, permissions: PermissionKey[]): boolean {
  return permissions.some((perm) => hasPermission(role, perm));
}

export function hasAllPermissions(role: SystemRole, permissions: PermissionKey[]): boolean {
  return permissions.every((perm) => hasPermission(role, perm));
}
