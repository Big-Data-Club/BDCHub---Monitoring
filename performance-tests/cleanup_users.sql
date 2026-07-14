-- =============================================================================
-- BDC Performance Test Users Cleanup Script
-- =============================================================================
-- This script safely removes all seeded performance test users and their related
-- active records from the Auth and LMS databases.
-- Target ID range: 90001 to 93000
-- =============================================================================

--------------------------------------------------------------------------------
-- PART 1: RUN ON LMS DATABASE (postgres-lms on port 5434 / database 'lms')
--------------------------------------------------------------------------------

DO $$
BEGIN
    -- 1. Unset graded_by references in quiz attempts and answers to allow user deletion
    UPDATE quiz_student_answers SET graded_by = NULL WHERE graded_by BETWEEN 90001 AND 93000;
    UPDATE quiz_attempts SET graded_by = NULL WHERE graded_by BETWEEN 90001 AND 93000;

    -- 2. Clean up micro-lessons and micro-quizzes jobs created by test teachers/admins
    -- (Deletes will cascade to micro_lessons and micro_quizzes tables)
    DELETE FROM micro_lesson_jobs WHERE created_by BETWEEN 90001 AND 93000;
    DELETE FROM micro_quiz_jobs WHERE created_by BETWEEN 90001 AND 93000;

    -- 3. Clean up section contents created by test teachers/admins
    DELETE FROM section_content WHERE created_by BETWEEN 90001 AND 93000;

    -- 4. Clean up courses created by test teachers/admins
    DELETE FROM courses WHERE created_by BETWEEN 90001 AND 93000;

    -- 5. Delete the test users themselves
    -- (Deletes will cascade to: user_roles, organization_members, micro_lesson_interactions, knowledge_node_mastery)
    DELETE FROM users WHERE id BETWEEN 90001 AND 93000;

    -- Reset users_id_seq sequence
    PERFORM setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users WHERE id < 90000), 1));
END $$;


--------------------------------------------------------------------------------
-- PART 2: RUN ON AUTH DATABASE (postgres on port 5433 / database 'auth')
--------------------------------------------------------------------------------

DO $$
BEGIN
    -- 1. Delete dependent auth records
    DELETE FROM password_reset_tokens WHERE user_id BETWEEN 90001 AND 93000;
    DELETE FROM organization_members WHERE user_id BETWEEN 90001 AND 93000;
    DELETE FROM task_scores WHERE user_id BETWEEN 90001 AND 93000 OR scored_by BETWEEN 90001 AND 93000;
    DELETE FROM user_tasks WHERE user_id BETWEEN 90001 AND 93000;

    -- 2. Delete test user content
    DELETE FROM announcements WHERE created_by BETWEEN 90001 AND 93000 OR updated_by BETWEEN 90001 AND 93000;
    DELETE FROM events WHERE created_by BETWEEN 90001 AND 93000 OR updated_by BETWEEN 90001 AND 93000;
    DELETE FROM tasks WHERE created_by BETWEEN 90001 AND 93000 OR updated_by BETWEEN 90001 AND 93000;

    -- 3. Delete the users
    DELETE FROM users WHERE id BETWEEN 90001 AND 93000;

    -- Reset users_id_seq sequence
    PERFORM setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users WHERE id < 90000), 1));
END $$;
