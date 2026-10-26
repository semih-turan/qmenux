-- 0003: the PDF worker (qmenux_worker, apps/worker) reads published snapshots and completes export jobs.
-- It still cannot touch products, prices, members or settings; every row it writes is a job status.

CREATE POLICY worker_read ON qx.branches FOR SELECT TO qmenux_worker USING (true);
GRANT SELECT (tenant_id, id, name) ON qx.branches TO qmenux_worker;

CREATE POLICY worker_read ON qx.menu_revisions FOR SELECT TO qmenux_worker USING (true);
GRANT SELECT (tenant_id, branch_id, revision_no, snapshot, published_at) ON qx.menu_revisions TO qmenux_worker;

CREATE POLICY worker_all ON qx.pdf_export_jobs TO qmenux_worker USING (true) WITH CHECK (true);
GRANT SELECT, UPDATE (status, file_key, error, generated_at, expires_at) ON qx.pdf_export_jobs TO qmenux_worker;
