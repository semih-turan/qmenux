-- Rolls back 0001. Roles are cluster-wide and may be shared by other databases
-- (e.g. qmenux_test); they are intentionally kept.
DROP SCHEMA IF EXISTS qx CASCADE;
