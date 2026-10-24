# Backend dependency review, October 24, 2026

Scope: [issue #16](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/issues/16). Prepared with Jcode AI assistance; students must review adopted changes and include this assistance in their actual submission disclosure. This is a dependency-only repair for the optional Node API. It does not change browser-local detection, native models, confidence thresholds, signing or deployment.

## Observed risk and reachability

At baseline `8f48b3c`, `npm --prefix backend audit --omit=dev` exits nonzero with two affected package names: **sharp** (high) and **fast-uri** (moderate). An advisory listing is not proof that this app can be exploited.

- `backend/images.js` invokes sharp on uploaded image bytes to inspect metadata, orient, resize and produce RGB pixels. It validates encoded-body size before parsing, configures decoded-pixel limits, and rejects non-JPEG/PNG formats and excessive dimensions. Metadata must nevertheless be parsed before the exact format/dimensions are known, so allowed Content-Type alone is not grounds to dismiss image-decoder dependency advisories.
- fast-uri is transitive through Fastify's AJV compiler/serializer graph. No new route accepting arbitrary external URIs was found or added by this review. Specific advisory exploitability was not demonstrated.
- The default browser-local detector does not use this API. Do not expose the optional API merely to demonstrate these updates.

## Narrow changes

| Package | Before | After |
| --- | --- | --- |
| sharp | 0.34.5 | 0.35.5, exact pin |
| sharp platform bindings | 0.34.5 | 0.35.5 |
| sharp bundled libvips packages | 1.2.4 | 1.3.4 |
| fast-uri under AJV | 3.1.8 | 3.1.9 |
| other fast-uri instance | 4.2.2 | 4.2.3 |

The lockfile also adds the sharp 0.35.5 platform packages published for FreeBSD/WebContainers WASM. No unrelated application dependencies or production source were upgraded. Because sharp uses 0.x versions, this is a compatibility-significant update and must be regression-tested rather than applied with `npm audit fix --force`. No forced audit fix was used.

## Verification

Fresh local clean install on macOS arm64 / Node 26.7.0:

```sh
npm ci --prefix backend
npm --prefix backend run check
npm --prefix backend test
npm --prefix backend audit --omit=dev
npm --prefix backend ls sharp fast-uri
```

Results: syntax passes; **28 tests pass, 0 fail, 0 skip**; audit reports **0 known vulnerabilities** at the time of this review. Real sharp decoding is exercised for JPEG/PNG, EXIF orientation, decoded RGB geometry, invalid/mismatched content, byte/pixel limits and failure cases. Model outputs in API tests are stubbed; this does not establish real-model accuracy or performance.

The Node 24 Linux workflow in `.github/workflows/backend-safety.yml` verifies a clean checkout independently of the existing frontend regressions. See the linked PR/issue for its actual run outcome. This narrow green job must not be presented as a green whole-app release. The broader regression workflow in PR #18 continues to expose frontend failures.

A clean audit means no advisories reported by that registry scan at that time, not proof of security. Physical-device validation, final deployment selection, privacy/rights review and the remaining Congressional submission requirements are separate.

## Rollback and review

Review this patch independently of the frontend partner's work. It is based on main and does not depend on merging PR #18. If a later compatibility regression appears, revert this dependency patch in a new reviewed commit and keep the optional API private until a safe version is verified. Do not silently restore vulnerable dependencies in a public deployment.
