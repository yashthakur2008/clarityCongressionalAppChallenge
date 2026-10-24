# Congressional App Challenge 2026: submission checklist

**Deadline: Monday, October 26, 2026 at 9:00 AM PDT / 12:00 PM EDT / 16:00 UTC.** Aim to submit Sunday, October 25 evening. The application cannot be modified after the submission period ends.

Sources checked October 24: [official 2026 rulebook](https://www.congressionalappchallenge.us/wp-content/uploads/2026/05/2026-CAC-Rules.pdf) and [rules page](https://www.congressionalappchallenge.us/students/rules/). Confirm any additional instructions from the participating district. The general students landing page still references 2025, so use the year-specific rulebook. This replaces the inherited DAHacks/Devpost submission checklist.

[Readiness and progress](SUBMISSION_READINESS.md) · [Application drafting prompts](SUBMISSION_DRAFT.md) · [Judge guide](JUDGES.md) · [Issue tracker](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/issues/17)

## 1. Eligibility and ownership: students verify privately

Owner: Yash and partner. [Issue #2](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/issues/2).

- [ ] Every entrant is enrolled in middle or high school on October 26, 2026 and is a US resident. Citizenship is not required.
- [ ] The chosen Congressional district is hosting a challenge. An individual resides or attends school there. For a team, at least half of its members meet that district condition.
- [ ] There are no more than four students. Each student enters only one app, in one district, this year.
- [ ] The app was created after October 30, 2025. If this is a 2.0 entry, identify only the new coding for consideration.
- [ ] Confirm actual entering authors, inherited project contributions and rights. This repository is a fork of a multi-contributor hackathon project. Forking it does not establish sole authorship or permission to claim every contribution. Ask the organizers if outside-team contributions create uncertainty.
- [ ] Complete each personal profile, eligibility quiz and team invitation. One member creates the team profile and invites up to three others. Confirm eligibility approval email and application access.

Registration requests personal email rather than a school email, home/school addresses with nine-digit ZIP codes and district information, and guardian contact details. **Enter these only in the official private application. Never post them in GitHub or the readiness tracker.** A coding teacher/mentor contact is optional.

## 2. Originality, AI, rights and content

Owner: students, with technical inventory support from the agent. [Issue #3](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/issues/3).

- [ ] Verify significant student effort and technical understanding. The rules require student technical development and permit external libraries, frameworks and tools only with clear documentation.
- [ ] Fully disclose actual AI tools and the aspects they supported in the **submission materials**, not just the repository. AI must not constitute the entirety of technical development. Include agent-assisted coding/testing/documentation/submission preparation where applicable.
- [ ] Separate student work, inherited work, pretrained models and AI assistance. Each student reviews and can explain their own contribution. Do not infer authorship from commit counts.
- [ ] Review [ATTRIBUTION.md](../ATTRIBUTION.md), model/data/asset licenses and any permissions. Do not claim third-party models were invented or independently trained by the team.
- [ ] Confirm the entry respects intellectual-property, privacy and other third-party rights and the rulebook's content-suitability standards. Use consented, non-sensitive footage and no unsupported safety claims.

A general AI credit or this checklist does not certify eligibility. Students must review truthful disclosures and resolve uncertainty with organizers before certifying the entry.

## 3. Functional demonstration and release checks

The formal rule requires some degree of functionality. The checks below are our engineering safeguards for making truthful claims, not additional official contest requirements.

- [ ] Agree on one primary platform, final source commit and public demo URL with the frontend partner. Two historical URLs exist; see [#6](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/issues/6).
- [ ] Resolve release-blocking regressions. Run syntax, backend, frontend, Worker and applicable native checks. Do not substitute an old test count for a fresh final-release run.
- [ ] Verify Start, real inference, selected feedback, Stop/restart and failure recovery on the actual device. Verify accessibility and any demonstrated PiP/depth separately. Record failures and limits.
- [ ] Check source/demo access logged out. Judges can request app/source access, and failure to honor a reasonable verification request can disqualify an entry. A public repository is a convenient access path, not a replacement for a working demo.
- [ ] Keep a recording fallback. Explicitly identify simulations and unsupported features. No detections does not mean a safe path.

Frontend partner owns `frontend/`. Agent's first patch is limited to docs, CI and native test/provenance corrections. Native physical acceptance is unverified and the full frontend suite is failing; see the readiness report.

## 4. Required demonstration video

Owner: Yash and partner. [Issue #4](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/issues/4).

- [ ] Length **1–3 minutes**, maximum **180 seconds**. Do not use the inherited four-minute presentation as the CAC recording.
- [ ] Include **each participant's name**, app name, one-sentence purpose, target audience, tools and coding languages, and actual app functionality.
- [ ] Record a stationary, consented scene. Show real detections and feedback, not just camera preview or simulated objects. Explain limitations honestly.
- [ ] Upload to **YouTube or Vimeo** and set visibility to **public**. Unlisted does not meet the rulebook's stated visibility requirement.
- [ ] Verify duration, understandable audio, playback logged out and the final URL in the application. Captions are recommended for accessibility, not stated here as an official requirement.

Suggested timing: 0:00–0:20 participant names, app/purpose/audience; 0:20–1:30 working core flow; 1:30–2:15 languages, architecture and students' technical work; 2:15–2:45 limitations and learning. Leave time below three minutes rather than speeding through a four-minute script.

## 5. Application, review and confirmation

Owner: Yash, partner reviews. [Issue #5](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/issues/5).

- [ ] Inspect the actual 2026 application and district instructions. The rulebook gives example questions, not a guaranteed exhaustive field list.
- [ ] Prepare title, purpose, inspiration, a coding difficulty and its resolution, learning/biggest takeaway, and desired 2.0 changes. Use [the draft prompts](SUBMISSION_DRAFT.md) and the students' own truthful accounts.
- [ ] Include required video and all requested links, actual roster, credits and full AI disclosure. Match every feature claim to the recorded release.
- [ ] Both students review completeness and accuracy. The human owner accepts any releases/certifications and submits before the deadline.
- [ ] Retain submission confirmation privately. Publish only a redacted completion status and timestamp. Preparing files or opening issues is not submission.
- [ ] After the deadline, **every teammate individually** completes the exit questionnaire when received.

## Judging

The 2026 rulebook lists idea quality/originality, implementation including user experience/design, and demonstrated coding/programming skill. It does **not** assign the inherited DAHacks 25%-each weighting or require a Modern Life theme. Local Congressional offices may modify judging criteria. No score, prize or acceptance outcome is guaranteed.
