-- ==============================================================================
-- ASSETSCHOOL DATABASE SCHEMA - PHASE 01
-- PostgreSQL 15+ Migration 001: Initial Relational Foundation
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. INSTITUTIONS
CREATE TABLE IF NOT EXISTS institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    address TEXT,
    contact_email VARCHAR(255) NOT NULL,
    settings_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_institutions_code ON institutions(code);

-- 2. ROLES
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_system BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_institution_user_email UNIQUE (institution_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_institution_id ON users(institution_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- 4. CLASSROOMS
CREATE TABLE IF NOT EXISTS classrooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL,
    capacity INT NOT NULL DEFAULT 30,
    subnet_lan VARCHAR(50),
    broadcast_ip VARCHAR(50),
    is_online BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_institution_classroom_code UNIQUE (institution_id, code)
);

CREATE INDEX IF NOT EXISTS idx_classrooms_institution ON classrooms(institution_id);

-- 5. COURSES
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    academic_period VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_institution_course_code UNIQUE (institution_id, code)
);

CREATE INDEX IF NOT EXISTS idx_courses_institution ON courses(institution_id);

-- 6. STUDENTS
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    student_code VARCHAR(64) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    assigned_course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_institution_student_code UNIQUE (institution_id, student_code)
);

CREATE INDEX IF NOT EXISTS idx_students_institution ON students(institution_id);
CREATE INDEX IF NOT EXISTS idx_students_course ON students(assigned_course_id);

-- 7. DEVICES
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    hostname VARCHAR(255) NOT NULL,
    mac_address VARCHAR(32) NOT NULL,
    local_ip VARCHAR(45) NOT NULL,
    os_type VARCHAR(32) NOT NULL, -- 'windows', 'macos', 'linux', 'chromeos'
    os_version VARCHAR(100) NOT NULL,
    architecture VARCHAR(32) NOT NULL,
    hardware_serial VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'offline', -- 'online', 'offline', 'busy', 'locked', 'restricted'
    enrolled_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat_at TIMESTAMPTZ,
    is_revoked BOOLEAN DEFAULT false,
    revocation_reason TEXT,
    current_classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
    current_student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    is_demo BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_institution_device_mac UNIQUE (institution_id, mac_address)
);

CREATE INDEX IF NOT EXISTS idx_devices_institution ON devices(institution_id);
CREATE INDEX IF NOT EXISTS idx_devices_classroom ON devices(current_classroom_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_mac ON devices(mac_address);

-- 8. DEVICE_AGENTS
CREATE TABLE IF NOT EXISTS device_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    agent_version VARCHAR(50) NOT NULL,
    protocol_version VARCHAR(50) NOT NULL,
    process_pid INT,
    started_at TIMESTAMPTZ,
    public_key TEXT,
    connection_token VARCHAR(255),
    last_handshake_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_device_agent UNIQUE (device_id)
);

-- 9. DEVICE_CAPABILITIES
CREATE TABLE IF NOT EXISTS device_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    can_screen_broadcast BOOLEAN DEFAULT false,
    can_screen_receive BOOLEAN DEFAULT false,
    can_remote_input BOOLEAN DEFAULT false,
    can_lock_input BOOLEAN DEFAULT false,
    can_blackout_screen BOOLEAN DEFAULT false,
    can_file_transfer BOOLEAN DEFAULT false,
    can_process_block BOOLEAN DEFAULT false,
    can_url_block BOOLEAN DEFAULT false,
    can_chat BOOLEAN DEFAULT false,
    can_execute_command BOOLEAN DEFAULT false,
    can_collect_hardware_inventory BOOLEAN DEFAULT false,
    platform_notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_device_capabilities UNIQUE (device_id)
);

-- 10. CLASSROOM_SESSIONS
CREATE TABLE IF NOT EXISTS classroom_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    policy_snapshot JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_classroom_sessions_classroom ON classroom_sessions(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_sessions_teacher ON classroom_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classroom_sessions_active ON classroom_sessions(is_active);

-- 11. DEVICE_SESSIONS
CREATE TABLE IF NOT EXISTS device_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_session_id UUID NOT NULL REFERENCES classroom_sessions(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMPTZ,
    connection_quality VARCHAR(32) DEFAULT 'good',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_session_device UNIQUE (classroom_session_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_session ON device_sessions(classroom_session_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_device ON device_sessions(device_id);

-- 12. COMMANDS
CREATE TABLE IF NOT EXISTS commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_session_id UUID REFERENCES classroom_sessions(id) ON DELETE SET NULL,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    issuer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    command_type VARCHAR(64) NOT NULL,
    payload_json JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'dispatched', 'acknowledged', 'executed', 'failed', 'rejected'
    result_json JSONB DEFAULT '{}'::jsonb,
    issued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMPTZ,
    error_details TEXT
);

CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_id);
CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);
CREATE INDEX IF NOT EXISTS idx_commands_issued ON commands(issued_at);

-- 13. AUDIT_LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    details_json JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_institution ON audit_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- 14. ASSESSMENTS
CREATE TABLE IF NOT EXISTS assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    creator_teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    classroom_session_id UUID REFERENCES classroom_sessions(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 30,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assessments_institution ON assessments(institution_id);

-- 15. QUESTIONS
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    question_order INT NOT NULL DEFAULT 1,
    question_text TEXT NOT NULL,
    question_type VARCHAR(32) NOT NULL DEFAULT 'multiple_choice',
    options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    correct_answers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    points INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_questions_assessment ON questions(assessment_id);

-- 16. ASSESSMENT_RESULTS
CREATE TABLE IF NOT EXISTS assessment_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    max_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    answers_json JSONB DEFAULT '{}'::jsonb,
    submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_assessment_student UNIQUE (assessment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_results_assessment ON assessment_results(assessment_id);

-- 17. POLICIES
CREATE TABLE IF NOT EXISTS policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50) NOT NULL, -- 'web_filter', 'app_filter', 'usb_storage', 'screen_privacy'
    rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_enforced BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_policies_institution ON policies(institution_id);

-- 18. APPLICATION_INVENTORY
CREATE TABLE IF NOT EXISTS application_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    app_name VARCHAR(255) NOT NULL,
    app_version VARCHAR(100),
    publisher VARCHAR(255),
    install_date VARCHAR(50),
    binary_path TEXT,
    is_restricted BOOLEAN DEFAULT false,
    detected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_inventory_device ON application_inventory(device_id);

-- 19. FILES
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    uploader_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_files_institution ON files(institution_id);
