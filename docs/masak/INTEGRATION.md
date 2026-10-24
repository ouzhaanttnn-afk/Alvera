# Alvera MASAK integration

## Routes
- Existing homepage, prices, catalog and /admin are retained.
- Form: /masak-form
- MFA-protected administration: /masak-form/admin
- Privacy: /masak-form/privacy
- Private API: /api/masak/*
- Worker: POST /api/masak/jobs with server-only Bearer secret.

## Deployment gates
Remote intake remains closed with MASAK_INTAKE_ENABLED=false and LEGAL_REVIEW_APPROVED=false. Antivirus, approved privacy notice, verified corporate and KVKK contact details, DNS and validated email delivery are required before opening.
Preview/development may use the existing test Supabase. Production requires separately approved production credentials; never copy local administrator passwords to hosting.
ADMIN_EMAIL and EMAIL_FROM are server settings. Notifications contain only reference/date/type/status and an authorized administration link. No identity documents, full identity numbers or signatures are emailed.
Residence documents are PDF-only. Private files never enter the public directory.

## Preservation and rollout
The existing HTML/CSS/JS site is copied into public at build time. Existing API handlers run through a Next.js adapter. The source form keeps validation, private Storage, ownership, transactions, idempotency, PDF, allowlist and AAL2.
Main pushes trigger production. Test and build locally, then verify a preview in the existing alvera Vercel project before updating main. No new Vercel project or paid service is required.
The apex domain was discovered on the separate form test project, www on alvera. Recheck cloud assignment before consolidation. No lumoza.art operations belong to this integration.
The source scheduler is inactive and targets the standalone form. Rebinding is a separate controlled rollout step; keep it inactive until all gates pass.
Source setup/deployment/DNS/test records are historical. They do not prove this integrated build was tested.
