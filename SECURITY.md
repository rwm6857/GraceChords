# Security Policy

This document describes how to report security issues, what is considered in scope, and how we handle disclosures for this project.

## Supported Versions

- Active support: `main` and the most recent release.
- Older versions: best‑effort security fixes only, as time permits.

## Reporting a Vulnerability

Please avoid filing public issues for potential security problems.

Preferred:
- Use GitHub Security Advisories: open a private report via the repository’s “Security” tab → “Report a vulnerability.” This keeps details private while we investigate.

If you cannot use advisories:
- Open a minimal public issue titled “Security: request contact” without details; a maintainer will follow up with a private channel.

When reporting, include if possible:
- Impact and a clear description of the issue
- Steps to reproduce or a proof‑of‑concept
- Affected commit SHA or version and environment details
- Any suggested remediation ideas

We will:
- Acknowledge receipt within 3 business days
- Provide progress updates at least weekly while triaging/fixing
- Aim to fix critical issues as quickly as feasible (target 14 days when practical)

## Coordinated Disclosure

Please give us a reasonable window to investigate and release a fix before any public disclosure. We’re happy to credit reporters in release notes upon request after a fix ships.

## Scope

In scope:
- Application code under `src/`
- Build and maintenance scripts under `scripts/`
- Static site configuration used by the app

Out of scope (non‑exhaustive):
- Social engineering, physical access, or third‑party service compromise
- DoS/DDoS or volumetric/resource‑exhaustion attacks
- Vulnerabilities requiring changes exclusively in upstream dependencies without a viable workaround
- Best‑practice suggestions without demonstrable security impact
- Typos, UI/UX issues, or missing non‑critical security headers on static assets

## Handling Sensitive Data

- Do not include real secrets or personal data in reports.
- Never commit `.env` files or credentials; follow the repo guidance (e.g., local `VITE_ADMIN_PW`).

## Remediation and Updates

Fixes are delivered through normal pull requests and included in the next release/deploy. If a change affects generated data (e.g., song index), maintainers will run the documented build scripts as part of release.

## Safe Harbor

We will not pursue legal action for good‑faith, non‑disruptive research that respects privacy, avoids data destruction or service degradation, and follows this policy and applicable laws.

