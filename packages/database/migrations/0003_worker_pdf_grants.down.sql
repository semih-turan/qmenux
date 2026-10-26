REVOKE SELECT, UPDATE ON qx.pdf_export_jobs FROM qmenux_worker;
DROP POLICY IF EXISTS worker_all ON qx.pdf_export_jobs;
REVOKE SELECT ON qx.menu_revisions FROM qmenux_worker;
DROP POLICY IF EXISTS worker_read ON qx.menu_revisions;
REVOKE SELECT ON qx.branches FROM qmenux_worker;
DROP POLICY IF EXISTS worker_read ON qx.branches;
