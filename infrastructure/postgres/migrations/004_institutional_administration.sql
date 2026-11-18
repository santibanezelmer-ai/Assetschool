-- ==============================================================================
-- ASSETSCHOOL DATABASE SCHEMA - PHASE E
-- Migration 004: Complete Institutional Administration System
-- ==============================================================================

-- 1. EXTEND INSTITUTIONS
ALTER TABLE institutions
ADD COLUMN IF NOT EXISTS rut VARCHAR(20),
ADD COLUMN IF NOT EXISTS region VARCHAR(100),
ADD COLUMN IF NOT EXISTS comuna VARCHAR(100),
ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS server_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_institutions_active ON institutions(is_active);

-- Update seed institution with Chilean tax ID & regional context
UPDATE institutions 
SET rut = '76.123.456-7',
    region = 'Región Metropolitana',
    comuna = 'Santiago',
    contact_phone = '+56 2 2345 6789',
    is_active = true
WHERE code = 'CPC-01' AND rut IS NULL;

-- 2. ENSURE INSTITUTIONAL ROLES
INSERT INTO roles (id, name, description, permissions, is_system) VALUES
('66666666-6666-6666-6666-666666666666', 'DIRECTOR', 'Director o Encargado de Establecimiento Educacional', '["institution:view", "user:view", "classroom:view", "course:view", "reports:view", "audit:view"]'::jsonb, true)
ON CONFLICT (name) DO NOTHING;

-- 3. EXTEND USERS
ALTER TABLE users
ADD COLUMN IF NOT EXISTS username VARCHAR(100),
ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 4. EXTEND COURSES
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS education_level VARCHAR(100) DEFAULT 'Educación General',
ADD COLUMN IF NOT EXISTS grade VARCHAR(50) DEFAULT '1°',
ADD COLUMN IF NOT EXISTS section VARCHAR(10) DEFAULT 'A',
ADD COLUMN IF NOT EXISTS academic_year INT DEFAULT 2026,
ADD COLUMN IF NOT EXISTS lead_teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_courses_year ON courses(academic_year);
CREATE INDEX IF NOT EXISTS idx_courses_active ON courses(is_active);

-- 5. EXTEND CLASSROOMS
ALTER TABLE classrooms
ADD COLUMN IF NOT EXISTS physical_location VARCHAR(200),
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS operational_status VARCHAR(32) DEFAULT 'operational',
ADD COLUMN IF NOT EXISTS schedule_json JSONB DEFAULT '[]'::jsonb;

-- 6. EXTEND STUDENTS
ALTER TABLE students
ADD COLUMN IF NOT EXISTS national_id VARCHAR(32),
ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS assigned_device_id UUID REFERENCES devices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_national_id ON students(national_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

-- 7. USER_CLASSROOMS ASSIGNMENT TABLE
CREATE TABLE IF NOT EXISTS user_classrooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_classroom UNIQUE (user_id, classroom_id)
);

CREATE INDEX IF NOT EXISTS idx_user_classrooms_user ON user_classrooms(user_id);
CREATE INDEX IF NOT EXISTS idx_user_classrooms_room ON user_classrooms(classroom_id);

-- 8. USER_COURSES ASSIGNMENT TABLE
CREATE TABLE IF NOT EXISTS user_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    is_lead_teacher BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_course UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_user_courses_user ON user_courses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_courses_course ON user_courses(course_id);

-- 9. STUDENT_DEVICE_HISTORY TABLE
CREATE TABLE IF NOT EXISTS student_device_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    unassigned_at TIMESTAMPTZ,
    assigned_by VARCHAR(100),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_sdh_student ON student_device_history(student_id);
CREATE INDEX IF NOT EXISTS idx_sdh_device ON student_device_history(device_id);

-- 10. EXTEND DEVICES INVENTORY
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS device_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS processor VARCHAR(128),
ADD COLUMN IF NOT EXISTS ram_mb INT,
ADD COLUMN IF NOT EXISTS storage_gb INT,
ADD COLUMN IF NOT EXISTS is_pending_approval BOOLEAN DEFAULT false;

-- Update existing devices with hardware defaults if null
UPDATE devices
SET processor = CASE 
        WHEN os_type = 'macos' THEN 'Apple M2 Pro (10-Core)'
        WHEN os_type = 'windows' THEN 'Intel Core i7-13700H @ 2.40GHz'
        WHEN os_type = 'linux' THEN 'AMD Ryzen 5 5600G with Radeon Graphics'
        ELSE 'Intel Celeron N4020'
    END,
    ram_mb = CASE 
        WHEN os_type = 'macos' THEN 16384
        WHEN os_type = 'windows' THEN 16384
        WHEN os_type = 'linux' THEN 8192
        ELSE 4096
    END,
    storage_gb = CASE 
        WHEN os_type = 'macos' THEN 512
        WHEN os_type = 'windows' THEN 512
        WHEN os_type = 'linux' THEN 256
        ELSE 64
    END
WHERE processor IS NULL;

-- 11. ENROLLMENT TOKENS TABLE
CREATE TABLE IF NOT EXISTS enrollment_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
    token VARCHAR(64) UNIQUE NOT NULL,
    label VARCHAR(150),
    max_uses INT DEFAULT 1,
    uses_count INT DEFAULT 0,
    is_revoked BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_enrollment_tokens_token ON enrollment_tokens(token);
CREATE INDEX IF NOT EXISTS idx_enrollment_tokens_inst ON enrollment_tokens(institution_id);

-- Seed initial teacher assignments
INSERT INTO user_classrooms (institution_id, user_id, classroom_id)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'd1111111-1111-1111-1111-111111111111'
ON CONFLICT (user_id, classroom_id) DO NOTHING;

INSERT INTO user_courses (institution_id, user_id, course_id, is_lead_teacher)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'e1111111-1111-1111-1111-111111111111', true
ON CONFLICT (user_id, course_id) DO NOTHING;
