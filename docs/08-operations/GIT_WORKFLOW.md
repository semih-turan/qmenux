# QMenuX Git Workflow and Version Control — v9

Status: Approved workflow | 2026-10-25

## Principles
- Existing user-created Git repository is authoritative. **Never run `git init` if `.git` already exists**; do not replace or delete `.git`, change remotes, or reset history.
- Protect `main` (or the actual default branch) as stable. Feature work goes into task branches, one task or cohesive dependency-complete unit at a time.
- The agent must inspect `git status --short`, `git branch --show-current`, `git log -1 --oneline`, and `.gitignore` before changes. If there are unrelated/uncommitted user changes, preserve them and ask before proceeding if isolation is unsafe.
- Do not automatically `git push`, merge, rebase, force-push, reset --hard, clean, delete branches, amend published commits, or change remote/branch protection.
- Commits require user authorization. The default is to **prepare and review changes, not commit** unless the user explicitly authorizes a commit or a clearly bounded series of task commits.

## Branches and commit names
- `feat/T001-monorepo-setup`, `feat/T003-tenant-isolation`, `fix/T016-geofence-validation`, `docs/T000-architecture-decisions`.
- Branch from up-to-date default branch only if the working tree is clean; never overwrite an existing branch.
- Conventional Commits with task ID: `chore(T001): initialize pnpm monorepo`, `feat(T005): implement catalog CRUD`, `test(T003): verify RLS tenant isolation`, `docs(T000): record decision`.
- Avoid mixing unrelated tasks in a commit; stage explicit paths rather than indiscriminately `git add .`.

## Workflow per task
1. Inspect branch, status, existing modifications, and relevant task acceptance criteria.
2. Agree task scope; create a dedicated branch (only if safe).
3. Implement minimal complete change with tests and docs; do not overwrite user changes.
4. Run relevant `lint`, `typecheck`, `test`, `build` and security/tenant tests; record actual commands and results. Never claim unrun tests passed.
5. Update `TASKS.md` and `PROGRESS.md` with status, evidence, commit reference if applicable. Never mark DONE without evidence and required reviewer approval.
6. Review `git diff --check`, `git diff --stat`, `git diff`, and staged diff. Check for credentials, secrets and accidental generated files.
7. If authorized, commit only scoped files with task ID and report commit hash. Otherwise provide exact recommended commit command.
8. Stop and request review before merging into default branch. Prefer pull requests and CI status checks.

## Security and ignored files
- Use root `.gitignore` (provided) for `.env*` except `!.env.example`, `node_modules`, `.next`, `.turbo`, `dist`, coverage, logs, temporary outputs and editor caches.
- `.env.example` must contain placeholder values only. Do not commit real Neon URLs, R2 credentials, OAuth secrets, private keys, provider tokens or personal data.
- `.gitignore` does **not** untrack already-tracked secrets; if found, stop, report exposure and request credential rotation and cleanup.
- GitHub recommended: protect default branch, require PR + checks, least-privilege repo access, secret scanning, no force pushes.

## CI (implementation task, not assumed configured)
- GitHub Actions: install frozen pnpm dependencies, lint, typecheck, tests, build, secret scan. Never use production secrets in pull request CI; Neon test DB or mocks only as explicitly approved.
- CI is required before PR merge once pipeline exists. Local green checks do not replace required manual/legal reviews.

## First repository baseline
- User has already created a Git repository. Check `git status` and tracked files first. If docs are untracked, inspect staged diff and request authorization for an initial docs-only baseline commit, e.g. `docs(T000): add QMenuX v9 project specifications`.
- No production application code is required for baseline; don't create a second nested repository.
- If no initial commit exists, branch creation may need to wait until the authorized baseline commit.

## Completion report template
- Task and branch
- Modified paths
- Tests/checks run and results
- Documentation/progress updates
- Commit hash (or `not committed`)
- Risks/blockers
- Next task and review request

## T053 checks and branch protection
Implementation: `.github/workflows/ci.yml`; [hosted PR run](https://github.com/semih-turan/qmenux/actions/runs/40195730650) and [push run](https://github.com/semih-turan/qmenux/actions/runs/40195729972) passed at `a7cc4b9` on 2026-10-25. Branch protection is not configured (GitHub API reports main protected=false); reviewer acceptance remains pending.

- `Quality`: Ubuntu 24.04; Node from `.node-version`; pnpm from `packageManager`; frozen install; full dependency audit at low-or-higher severity; lint/typecheck; Chromium and Linux OS dependencies; API/mobile-width browser tests; all application builds. Any failed command fails the job. Playwright `test.only` is rejected in CI.
- `Secret scan`: separate Ubuntu job with full checkout history (`fetch-depth: 0`), pinned/checksum-verified Gitleaks 8.30.1 and `git --redact --no-banner --log-opts="--all" .`. Covers all fetched refs; local-only/unpushed refs and ignored working files are outside remote coverage. A leak or scanner/download failure fails the job; no blanket baseline/allowlist was added.
- Events: `pull_request`, `push` and `workflow_dispatch`. No path filters, `pull_request_target`, privileged workflow chaining, deployment, production environment or explicit repository-secret references. Manual dispatch availability depends on the workflow being present on the default branch; first evidence can come from an authorized push/PR.
- Permissions: `contents: read`; checkout credentials not persisted. No self-hosted runner, remote Turbo cache, dependency cache or artifact upload. Jobs have timeouts; superseded runs are cancelled per PR/ref. Do not add production secrets or production DB URLs to PR CI.
- Update policy: verify new action SHAs against official tagged commits and Gitleaks archives against official release checksums; review pin updates as code changes. The binary download is intentionally restricted to the Ubuntu x64 runner; local macOS validation used the checksum-verified Darwin arm64 release separately.

Recommended owner-configured default-branch protection (not changed by the agent): require a PR and successful `Quality` and `Secret scan` checks from GitHub Actions, require current base-branch validation, block force pushes/deletions and avoid routine bypass. Select actual check names/app after the first successful run; do not require guessed contexts. Establish the human reviewer policy explicitly (an independent approval requires another authorized reviewer). Keep workflow edits under review.

First-run acceptance evidence required before T053 DONE:
1. Separately authorize the task commit/push or publish the reviewed changes yourself; no automatic commit/remote mutation.
2. Record run URL, triggering branch/PR, commit SHA, runner/runtime and results for both checks. Confirm Chromium installation and all quality steps actually ran on Ubuntu, without production credentials.
3. Record reviewer name/date, any fork-PR approval limitations and chosen protection settings (or clearly note protection is only recommended).
4. Update TASKS.md/PROGRESS.md with actual evidence. YAML validation and local checks alone cannot satisfy GIT-002 or T001's CI-green acceptance.

Local validation commands: `actionlint .github/workflows/ci.yml`; `gitleaks git --redact --no-banner --log-opts="--all" .`; the same pnpm quality commands with `CI=true`. Install Gitleaks/actionlint from their checksum-verified official releases. A local Git scan covers committed history; a separate nonignored-source snapshot scan is needed to inspect uncommitted files before commit. Never paste discovered secrets into review output; report redacted locations and rotate exposed credentials.

Rollback: reverse only the T053 workflow, Playwright CI guard and documentation edits after checking for later changes; no application data/migration involved. Never rewrite history to remove a workflow. Required-check settings, once configured, need coordinated owner changes to avoid a permanently pending merge gate.
