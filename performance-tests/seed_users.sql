-- =============================================================================
-- BDC Performance Test Users Seeding Script
-- =============================================================================
-- This script seeds 100 students, 10 teachers, and 5 admins for performance testing.
-- Target passwords are all set to 'password' (BCrypt hash is pre-computed).
-- ID ranges are explicit and non-overlapping:
--   - Students: 90001 to 90100
--   - Teachers: 91001 to 91010
--   - Admins: 92001 to 92005
-- =============================================================================

--------------------------------------------------------------------------------
-- PART 1: RUN ON AUTH DATABASE (postgres on port 5433 / database 'auth')
--------------------------------------------------------------------------------

DO $$
DECLARE
    bcrypt_pwd VARCHAR := '$2a$10$8.K3p7/t9B1O.R6O0F2zxeHl2KjGhyx9r1XG83WvX17H66z.Bq1I6'; -- BCrypt hash of 'password'
BEGIN
    -- 1. Seed Student Users (90001 - 90100)
    FOR i IN 1..100 LOOP
        INSERT INTO users (id, name, email, password, role, team, code, type, active, total_score, auth_provider, pending_approval)
        VALUES (
            90000 + i,
            'Test Student ' || i,
            'test_student_' || i || '@example.com',
            bcrypt_pwd,
            'ROLE_USER',
            'RESEARCH',
            'STUDENT' || LPAD(i::text, 3, '0'),
            'STUDENT',
            true,
            0,
            'LOCAL',
            false
        )
        ON CONFLICT (id) DO UPDATE SET 
            password = EXCLUDED.password, 
            role = EXCLUDED.role, 
            email = EXCLUDED.email, 
            name = EXCLUDED.name;
    END LOOP;

    -- 2. Seed Teacher Users (91001 - 91010)
    FOR i IN 1..10 LOOP
        INSERT INTO users (id, name, email, password, role, team, code, type, active, total_score, auth_provider, pending_approval)
        VALUES (
            91000 + i,
            'Test Teacher ' || i,
            'test_teacher_' || i || '@example.com',
            bcrypt_pwd,
            'ROLE_MANAGER',
            'RESEARCH',
            'TEACHER' || LPAD(i::text, 3, '0'),
            'TEACHER',
            true,
            0,
            'LOCAL',
            false
        )
        ON CONFLICT (id) DO UPDATE SET 
            password = EXCLUDED.password, 
            role = EXCLUDED.role, 
            email = EXCLUDED.email, 
            name = EXCLUDED.name;
    END LOOP;

    -- 3. Seed Admin Users (92001 - 92005)
    FOR i IN 1..5 LOOP
        INSERT INTO users (id, name, email, password, role, team, code, type, active, total_score, auth_provider, pending_approval)
        VALUES (
            92000 + i,
            'Test Admin ' || i,
            'test_admin_' || i || '@example.com',
            bcrypt_pwd,
            'ROLE_ADMIN',
            'RESEARCH',
            'ADMIN' || LPAD(i::text, 3, '0'),
            'ADMIN',
            true,
            0,
            'LOCAL',
            false
        )
        ON CONFLICT (id) DO UPDATE SET 
            password = EXCLUDED.password, 
            role = EXCLUDED.role, 
            email = EXCLUDED.email, 
            name = EXCLUDED.name;
    END LOOP;

    -- Reset users_id_seq sequence to prevent sequence conflict in future manual registrations
    PERFORM setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users WHERE id < 90000), 1));
END $$;


--------------------------------------------------------------------------------
-- PART 2: RUN ON LMS DATABASE (postgres-lms on port 5434 / database 'lms')
--------------------------------------------------------------------------------

DO $$
BEGIN
    -- 1. Seed Student Users & Roles in LMS
    FOR i IN 1..100 LOOP
        INSERT INTO users (id, email, full_name)
        VALUES (
            90000 + i,
            'test_student_' || i || '@example.com',
            'Test Student ' || i
        )
        ON CONFLICT (id) DO UPDATE SET 
            email = EXCLUDED.email, 
            full_name = EXCLUDED.full_name;

        INSERT INTO user_roles (user_id, role, source)
        VALUES (90000 + i, 'STUDENT', 'sync')
        ON CONFLICT (user_id, role) DO NOTHING;
    END LOOP;

    -- 2. Seed Teacher Users & Roles in LMS
    FOR i IN 1..10 LOOP
        INSERT INTO users (id, email, full_name)
        VALUES (
            91000 + i,
            'test_teacher_' || i || '@example.com',
            'Test Teacher ' || i
        )
        ON CONFLICT (id) DO UPDATE SET 
            email = EXCLUDED.email, 
            full_name = EXCLUDED.full_name;

        INSERT INTO user_roles (user_id, role, source)
        VALUES (91000 + i, 'TEACHER', 'sync')
        ON CONFLICT (user_id, role) DO NOTHING;
    END LOOP;

    -- 3. Seed Admin Users & Roles in LMS
    FOR i IN 1..5 LOOP
        INSERT INTO users (id, email, full_name)
        VALUES (
            92000 + i,
            'test_admin_' || i || '@example.com',
            'Test Admin ' || i
        )
        ON CONFLICT (id) DO UPDATE SET 
            email = EXCLUDED.email, 
            full_name = EXCLUDED.full_name;

        INSERT INTO user_roles (user_id, role, source)
        VALUES (92000 + i, 'ADMIN', 'sync')
        ON CONFLICT (user_id, role) DO NOTHING;
    END LOOP;

    -- Reset serial sequences for safety
    PERFORM setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users WHERE id < 90000), 1));
END $$;
