# Team ownership and workflow

## Congressional submission handoff, October 24

- **Frontend partner:** owns `frontend/`, startup/cancellation fixes, accessibility and UI acceptance. Other agents do not edit those files without coordination.
- **Yash:** proposed submission/release coordinator; confirm final roster and division with partner. Students alone verify eligibility, contribution history, rights, disclosures and application certifications.
- **Agent first patch:** CAC docs/readiness, release CI and native provenance/stale-test correction. No frontend redesign, model/threshold changes, deployment, signing or device capture.
- **Both students:** final-device rehearsal, public 1–3 minute video, application review and Sunday-evening submission target. See [CAC checklist](demo.md) and [readiness](SUBMISSION_READINESS.md).

The older role table below records hackathon responsibilities, not the confirmed CAC entrant roster.

| Role | Owns |
| --- | --- |
| Backend: Yash | API, data model, validation, backend tests |
| Frontend: design-focused | User flow, styling, shared components, accessibility |
| Frontend: newer developer | Scoped screens, forms, integration, UI states |
| QA/QC | Acceptance checks, end-to-end testing, bug triage, release verification |
| DevOps | CI after stack selection, deployments, environments, logs and recovery |

These are responsibilities, not exclusive permissions. Every developer tests their changes. QA is not the only quality owner.

## Assign at kickoff

Choose one existing member as scope owner, one as demo/submission owner, and one as integration coordinator. Record their names here when agreed. The scope owner protects one core user journey and cuts nonessential features. The submission owner tracks the CAC application and demo materials. The integration coordinator keeps frontend/backend changes compatible.

## Working agreement

- Keep `main` demoable. Use short-lived `feat/…`, `fix/…`, or `docs/…` branches.
- Open small PRs with one teammate reviewing before merge. This is a team agreement, not configured branch protection.
- Agree who edits shared files. Do not force-push shared history.
- Agree on API examples before frontend/backend work diverges.
- Use issues for tasks with one owner, acceptance criteria, and a priority: must-have or optional.
- Integrate frequently and get a deployed vertical slice working early.
- Reserve the final hour for regression testing, demo recording, and submission.
- Never commit secrets. Share credentials through an appropriate private channel or platform secret store.

## Definition of done

The agreed user behavior works, relevant tests/checks pass, loading and failure cases are handled, setup changes are documented, and the deployed demo still works.
