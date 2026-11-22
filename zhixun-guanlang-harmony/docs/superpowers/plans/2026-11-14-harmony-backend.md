# Harmony Backend Implementation Plan

> For agentic workers: use superpowers:executing-plans and track the steps below.

Goal: Route Harmony traffic through a standalone mobile service and complete shared patrol submission.

Architecture: Node.js 24 service in `backend/` with a fixed upstream and explicit route table; ArkUI client keeps its current API envelope. The web application and database remain untouched.

Spec: `docs/superpowers/specs/2026-11-14-harmony-backend-design.md`.

- [x] Write HTTP tests for forwarding login, patrol submission, authorization errors, blocking unlisted routes and upstream timeout without retry.
- [x] Build `backend/server.mjs` exporting `createMobileServer({ upstream, timeoutMs })`; add liveness and readiness probes and CLI configuration. Run all Node tests.
- [x] Repoint the ArkTS session to the mobile service and add `PatrolPage.ets` to the authenticated inspection view. Fetch runs and points and submit a result; preserve drafts on failure and distinguish submission from refresh failure.
- [x] Build the native HAP, document startup and record which end-to-end checks were possible.

Execution note: the repository has no commits and its application is untracked, so a Git worktree cannot reproduce the current baseline. Work in the supplied workspace and leave its Git state intact.

Verification: all 12 Node tests passed against a local mock upstream. The native unsigned HAP compiled and passed bundle inspection. The live two-client patrol and work-order sequence remains unverified: no isolated running upstream and usable phone target were identified.
