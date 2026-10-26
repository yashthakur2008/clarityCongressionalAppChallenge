# Team ownership and workflow

## Congressional submission: sole entrant, confirmed October 26

- **Yash is the sole Congressional App Challenge entrant.** The user confirmed a solo entry on October 26. There is no second entering student or required teammate invitation for this entry.
- **Yash owns** eligibility, district selection, individual contribution/rights verification, AI disclosure, release approval, device rehearsal, the public 1–3 minute video, application review and submission.
- **Earlier frontend collaborators are not automatically entrants.** Preserve credits for their actual work and confirm reuse rights. Solo entrant status does not mean every line or asset was authored solely by Yash.
- **Agent assistance:** audit, issues, docs, CI, native test/provenance correction, dependency updates, frontend startup/alert/cache fixes and acceptance testing. Include adopted AI assistance in the actual submission and review the changes personally.
- **Repository:** all submission PRs target `yashthakur2008/clarityCongressionalAppChallenge`, not the inherited upstream hackathon repository.
- **Hosting:** Cloudflare, confirmed by Yash. Use the isolated judges-preview configuration; do not overwrite the separate production inference Worker.

See [CAC checklist](demo.md), [contribution worksheet](SUBMISSION_DRAFT.md), and [readiness](SUBMISSION_READINESS.md).

The older role table below records hackathon responsibilities, not the confirmed CAC entrant roster.

| Role | Owns |
| --- | --- |
| Backend: Yash | API, data model, validation, backend tests |
| Frontend: design-focused | User flow, styling, shared components, accessibility |
| Frontend: newer developer | Scoped screens, forms, integration, UI states |
| QA/QC | Acceptance checks, end-to-end testing, bug triage, release verification |
| DevOps | CI after stack selection, deployments, environments, logs and recovery |

These are responsibilities, not exclusive permissions. Every developer tests their changes. QA is not the only quality owner.

## Historical multi-person workflow (not the current entrant roster)

Choose one existing member as scope owner, one as demo/submission owner, and one as integration coordinator. Record their names here when agreed. The scope owner protects one core user journey and cuts nonessential features. The submission owner tracks the CAC application and demo materials. The integration coordinator keeps frontend/backend changes compatible.

## Release working agreement

- Keep `main` demoable. Use short-lived `feat/…`, `fix/…`, or `docs/…` branches.
- Open small PRs for review. As sole entrant, Yash approves adopted changes; independent technical review supports quality but does not create another entrant.
- Agree who edits shared files. Do not force-push shared history.
- Agree on API examples before frontend/backend work diverges.
- Use issues for tasks with one owner, acceptance criteria, and a priority: must-have or optional.
- Integrate frequently and get a deployed vertical slice working early.
- Reserve the final hour for regression testing, demo recording, and submission.
- Never commit secrets. Share credentials through an appropriate private channel or platform secret store.

## Definition of done

The agreed user behavior works, relevant tests/checks pass, loading and failure cases are handled, setup changes are documented, and the deployed demo still works.
