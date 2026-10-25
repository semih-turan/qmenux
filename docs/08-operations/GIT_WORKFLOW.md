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
- Use root `.gitignore` for `.env*` except `!.env.example`, `node_modules`, `.next`, `.turbo`, `dist`, coverage, logs, temporary outputs and editor caches.
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

## T052 repository checkpoint — 2026-10-25
- User authorized starting T052 and creating `docs/T052-repository-baseline`; this does not authorize commits, pushes, merges or T001.
- At execution start, `main` was clean at `111542c`; local `origin/main` and remote HEAD recorded `main`. No fetch or remote policy inspection was performed, so server freshness/protection remains unverified.
- Documentation already exists in Git at `111542c`; preserve it. The earlier review's uncommitted-baseline observation was superseded by this user-created commit. No dirty-tree branch exception was used.
- Root `.gitignore` added. `.DS_Store` is already tracked; ignore rules do not remove it from the index. Existing file/index entry preserved; scoped removal from tracking remains a review item.
- Before requesting commit approval, review tracked diff AND untracked `.gitignore`, inspect for credentials, verify ignores, and stage only explicit approved paths if staging is requested. Keep index unchanged during this preparation.
- Proposed task commit after review: `docs(T052): establish repository governance baseline`. T052 remains IN_REVIEW until GIT-001 evidence and required reviewer acceptance are recorded.
