-- ==============================================================================
-- ASSETSCHOOL SEED DATA - PHASE 01
-- Base Roles, Default Demo Institution, Test Classrooms & Identified Demo Devices
-- ==============================================================================

-- 1. SEED ROLES
INSERT INTO roles (id, name, description, permissions, is_system) VALUES
('11111111-1111-1111-1111-111111111111', 'SUPERADMIN', 'Superadministrador global de la plataforma', '["*"]'::jsonb, true),
('22222222-2222-2222-2222-222222222222', 'INSTITUTION_ADMIN', 'Administrador TIC institucional', '["institution:view", "user:view", "user:create", "user:edit", "user:delete", "classroom:view", "classroom:manage", "course:view", "course:manage", "session:start", "session:end", "device:monitor", "device:control", "device:lock", "device:broadcast", "device:file_transfer", "device:command_dispatch", "policy:view", "policy:apply", "policy:manage", "device:enroll", "device:revoke", "assessment:view", "assessment:create", "assessment:launch", "assessment:grade", "audit:view", "inventory:view", "inventory:manage", "reports:view", "system:config"]'::jsonb, true),
('33333333-3333-3333-3333-333333333333', 'TEACHER', 'Docente de aula con control pedagógico', '["classroom:view", "course:view", "session:start", "session:end", "device:monitor", "device:control", "device:lock", "device:broadcast", "device:file_transfer", "device:command_dispatch", "policy:view", "policy:apply", "assessment:view", "assessment:create", "assessment:launch", "assessment:grade", "reports:view"]'::jsonb, true),
('44444444-4444-4444-4444-444444444444', 'TECH_SUPPORT', 'Soporte técnico y mantenimiento TIC', '["classroom:view", "device:monitor", "device:control", "device:enroll", "device:revoke", "inventory:view", "inventory:manage", "audit:view", "system:config"]'::jsonb, true),
('55555555-5555-5555-5555-555555555555', 'STUDENT', 'Estudiante en estación de trabajo', '["classroom:view", "course:view", "assessment:view"]'::jsonb, true)
ON CONFLICT (name) DO NOTHING;

-- 2. SEED DEFAULT INSTITUTION
INSERT INTO institutions (id, code, name, description, address, contact_email, settings_json) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CPC-01', 'Instituto Politécnico Central', 'Campus Principal - Red Educativa Local', 'Av. Tecnológica 1024, Edificio Norte', 'tic@politecnicocentral.edu', '{"lanSubnet": "192.168.1.0/24", "allowUsbDefault": false, "screenPrivacyNotice": true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 3. SEED USERS (Password hashed: "Admin123!*" -> bcrypt $2b$10$wTqK/8vC0Vb5lZcQW3d26Op03wY8C6Kx.o8b/f5s8Ie1K/R.3t846)
INSERT INTO users (id, institution_id, role_id, email, password_hash, first_name, last_name, is_active) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin@assetschool.lan', '$2b$10$iI8Y0y0/w79oUu0n9K1K6eS43u6R9.tJ8f5mGzK2T4l6O5h7U4r2q', 'Carlos', 'Valenzuela', true),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'profesor@assetschool.lan', '$2b$10$iI8Y0y0/w79oUu0n9K1K6eS43u6R9.tJ8f5mGzK2T4l6O5h7U4r2q', 'Mariana', 'Fuentes', true)
ON CONFLICT (institution_id, email) DO NOTHING;

-- 4. SEED CLASSROOMS
INSERT INTO classrooms (id, institution_id, name, code, capacity, subnet_lan, broadcast_ip, is_online) VALUES
('d1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Laboratorio Informática 1', 'LAB-01', 32, '192.168.1.0/24', '192.168.1.255', true),
('d2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Laboratorio Informática 2', 'LAB-02', 28, '192.168.2.0/24', '192.168.2.255', false)
ON CONFLICT (institution_id, code) DO NOTHING;

-- 5. SEED COURSES
INSERT INTO courses (id, institution_id, code, name, description, academic_period) VALUES
('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PROG-301', 'Programación y Algoritmos III', 'Especialidad Informática', '2026-S1'),
('e2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'REDES-402', 'Redes y Telecomunicaciones', 'Especialidad Telecomunicaciones', '2026-S1')
ON CONFLICT (institution_id, code) DO NOTHING;

-- 6. SEED STUDENTS
INSERT INTO students (id, institution_id, student_code, first_name, last_name, email, assigned_course_id) VALUES
('f1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EST-2026-001', 'Lucas', 'Pérez', 'lucas.perez@alumnos.cpc.edu', 'e1111111-1111-1111-1111-111111111111'),
('f2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EST-2026-002', 'Sofía', 'Navarro', 'sofia.navarro@alumnos.cpc.edu', 'e1111111-1111-1111-1111-111111111111'),
('f3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EST-2026-003', 'Mateo', 'Rojas', 'mateo.rojas@alumnos.cpc.edu', 'e1111111-1111-1111-1111-111111111111'),
('f4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EST-2026-004', 'Valentina', 'Castillo', 'valentina.castillo@alumnos.cpc.edu', 'e1111111-1111-1111-1111-111111111111')
ON CONFLICT (institution_id, student_code) DO NOTHING;

-- 7. SEED DEMO DEVICES (EXPLICITLY FLAGGED WITH is_demo = true AS TEST DATA)
INSERT INTO devices (id, institution_id, hostname, mac_address, local_ip, os_type, os_version, architecture, status, is_demo, current_classroom_id, current_student_id) VALUES
('01010101-0101-0101-0101-010101010101', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LAB01-PC-01', '02:42:AC:11:00:02', '192.168.1.101', 'windows', 'Windows 11 Pro 23H2', 'x86_64', 'online', true, 'd1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111'),
('02020202-0202-0202-0202-020202020202', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LAB01-MAC-02', '02:42:AC:11:00:03', '192.168.1.102', 'macos', 'macOS Sonoma 14.5', 'arm64', 'online', true, 'd1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222'),
('03030303-0303-0303-0303-030303030303', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LAB01-LNX-03', '02:42:AC:11:00:04', '192.168.1.103', 'linux', 'Ubuntu 24.04 LTS', 'x86_64', 'busy', true, 'd1111111-1111-1111-1111-111111111111', 'f3333333-3333-3333-3333-333333333333'),
('04040404-0404-0404-0404-040404040404', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LAB01-CRB-04', '02:42:AC:11:00:05', '192.168.1.104', 'chromeos', 'ChromeOS 124.0', 'x86_64', 'offline', true, 'd1111111-1111-1111-1111-111111111111', 'f4444444-4444-4444-4444-444444444444')
ON CONFLICT (institution_id, mac_address) DO NOTHING;

-- 8. SEED DEVICE CAPABILITIES (Reflecting actual real-world platform capabilities)
INSERT INTO device_capabilities (device_id, can_screen_broadcast, can_screen_receive, can_remote_input, can_lock_input, can_blackout_screen, can_file_transfer, can_process_block, can_url_block, can_chat, can_execute_command, can_collect_hardware_inventory, platform_notes) VALUES
('01010101-0101-0101-0101-010101010101', true, true, true, true, true, true, true, true, true, true, true, 'Windows Agent v1.0 .NET - Soporte completo de API nativa Win32'),
('02020202-0202-0202-0202-020202020202', true, true, true, true, true, true, false, true, true, true, true, 'macOS Agent v1.0 Swift - Requiere permisos de Accesibilidad y Grabación de Pantalla en TCC'),
('03030303-0303-0303-0303-030303030303', true, true, true, true, true, true, true, true, true, true, true, 'Linux Agent v1.0 Rust - Soporte para X11 nativo y Wayland mediante Portal'),
('04040404-0404-0404-0404-040404040404', false, true, false, false, false, false, false, true, true, false, false, 'ChromeOS Extension v1.0 - Limitado a APIs de extensiones administradas de Google Chrome')
ON CONFLICT (device_id) DO NOTHING;

-- 9. AUDIT LOG INITIAL RECORD
INSERT INTO audit_logs (institution_id, actor_role, action, entity_type, entity_id, ip_address, user_agent, details_json) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SUPERADMIN', 'SYSTEM_INITIALIZATION', 'SYSTEM', 'ROOT', '127.0.0.1', 'AssetSchool Seed Script', '{"version": "1.0.0-phase1", "status": "Schema initialized successfully"}'::jsonb);
