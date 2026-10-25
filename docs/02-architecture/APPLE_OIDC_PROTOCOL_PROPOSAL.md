# Apple OIDC protocol — narrow development proposal

Status: OWNER-DELEGATED development profile selected; named technical reviewer/date and real-user acceptance pending | 2026-10-25

## Owner decision and bounded scope
[Identity specification](../04-backend/IDENTITY_OIDC_ONBOARDING.md#identity-model) requires Authorization Code + PKCE and PKCE validation. Apple's current public metadata and authorization/token parameter documentation do not establish S256 enforcement. This is an evidence gap, not proof that Apple cannot support PKCE. Do not send an unverified challenge and label it protection, silently omit required checks, or copy Google/Microsoft behavior.

Recommended proposal: permit only the server-side Apple confidential-client development adapter to use Authorization Code with per-attempt state, browser binding and signed token-endpoint ID-token nonce verification, without claiming PKCE. Google/Microsoft keep S256 unchanged. This is an explicit provider-specific exception to the current QMenuX specification, not general OAuth weakening, public/native-client approval or real-user activation. Owner answered the exact exception question: “farketmez hangiis senin için uygunsa onunla git”. Engineering selects this recommended profile under that delegated choice, for the disabled internal development adapter only. This is not named security review or real-user approval.

Alternative: retain the blanket PKCE rule and defer Apple flow until authoritative capability evidence and a controlled actual-provider test establish S256 enforcement. Neither choice authorizes purchases, Apple registration/credentials, remote enablement or a security/legal release waiver.

## Evidence and limits (checked 2026-10-25)
| Source | Supported finding | Limit |
|---|---|---|
| [Apple metadata](https://appleid.apple.com/.well-known/openid-configuration) | Exact issuer appleid.apple.com; code, query/form_post; client_secret_post; RS256 ID-token signing | No advertised PKCE methods; absence is not a live enforcement test |
| [Apple authorization endpoint](https://developer.apple.com/documentation/signinwithapplerestapi/request-an-authorization-to-the-sign-in-with-apple-server.) | No name/email scope is permitted; requested scopes require form_post; code-only can use query; state and nonce are defined | Metadata lists openid, while this request reference enumerates name/email; do not assume Google-style scope=openid/query works without Apple verification |
| [Apple token endpoint](https://developer.apple.com/documentation/SigninwithAppleRESTAPI/Generate-and-validate-tokens) | Server code redemption requires client authentication and returns an ID token | Actual Services ID, return URL, nonce behavior and key acceptance not tested |
| [RFC9700 sections2.1.1/4.5.3.2](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.5.3.2) | Confidential OIDC clients may rely on a transaction/browser-bound nonce under the stated precautions | Verify the ID token obtained from the token endpoint; use no returned token before nonce succeeds. This does not protect public clients or establish Apple compatibility |

Third-party forum samples or broker PKCE flows are not Apple enforcement evidence. A broker-to-app PKCE exchange does not demonstrate PKCE on the Apple-facing hop. Apple's ES256 developer JWT is client authentication; it does not replace nonce/code-injection defenses or RS256 ID-token validation.

## Selected contract; later integration remains separately staged
1. Use only fixed HTTPS Apple issuer/authorize/token/JWKS endpoints. Reuse the existing API-only five-minute ES256 developer signer and bounded established OIDC/JWS libraries; keep secrets out of browser/Preview/build output. No client-selected issuer, audience, return URL or claims.
2. Request response_type=code and response_mode=query, with no scope parameter/name/email collection. Include fresh random state and nonce, bound to a separately random browser secret. Do not request hybrid/id_token/fragment delivery or add form_post as a silent fallback. Apple metadata/request-reference scope discrepancy must be resolved with actual provider evidence before enablement; rejection fails closed.
3. Bind state hash, browser-secret hash, nonce, fixed Apple issuer and five-minute expiry in identity-owned persistence. Use an independent host-only __Host-qmenux_apple_login Secure/HttpOnly/Path=/ SameSite=Lax cookie. The separately requested0008 slice now implements Apple-bound constraints/contracts with local/Neon tests; HTTP integration remains absent. No account linking by email, shared parent-domain cookie or new infrastructure.
4. Require actual GET, exact configured API host/path and one unambiguous state/cookie. Consume the Apple attempt atomically and commit before contacting Apple. Wrong provider/browser/expiry denies without consuming another provider's attempt; cancellation and provider errors cannot replay a consumed attempt.
5. Redeem the code only server-to-server using the fixed redirect URI and confidential client authentication. Require an ID token from that exchange; verify signature/RS256/kid/trusted JWKS, exact issuer/audience, expiry and the stored nonce. Reject absent/mismatched nonce. Ignore any front-channel token/user payload and all provider access/refresh tokens until validation succeeds; never use a token first and validate later. Do not pass a fake PKCE verifier or report PKCE tests passed.
6. Only a validated fixed Apple issuer+subject may create a REGISTERED normal API identity/session with tenantAccess=false, using a dedicated module contract. No membership/license/platform authority or provisioning. Normal API session rotation/read/logout remain distinct from eventual admin/superadmin BFF sessions. If redirecting after callback, use a fixed same-origin target; no returnTo/open redirect.
7. Fail with minimal401/503 and no secrets; sensitive responses no-store/no-referrer. Avoid code/state/token logging, third-party callback resources or credentials in browser storage. Actual provider/platform query-log retention/redaction must be reviewed before real users. Keep provider metadata false and no real credentials enabled until all release gates pass.

If optional name/email scopes or form_post are later needed, propose/test a new callback/browser-binding contract first. Cross-site POST cannot be assumed to carry Lax cookies; do not globally change SameSite to None or accept an unbound state as a shortcut.

## Implementation slices after a decision
- First: disabled internal Apple protocol adapter with signed-provider simulation and fixed endpoint/claim/nonce/error/timeout tests; no HTTP, migration or remote key.
- Storage slice separately requested and implemented as0008 with namespace/replay/concurrency/rollback/isolation evidence. Next, separately requested: GET callback/session integration, then mobile/browser tests.
- Separately authorized real-provider setup: verify Services ID/app eligibility, exact HTTPS return URL, domain/key ownership and token behavior using a test account; never infer success from a simulation. If evidence contradicts this proposal, stop and revise it.

## Required evidence before enablement
- Named/date technical review of the nonce-only confidential-client exception and attack cases; owner approval alone is not that review.
- Wrong/missing nonce, injected/mixed/replayed code, state/cookie duplication, issuer/audience/signature/expiry, key rotation, cancel/failure, provider namespace and pooled-RLS tests. No session/authority before the token-endpoint nonce check.
- Actual Apple code-only/no-scope/query/nonce success and failure evidence with correct HTTPS callback; actual Safari/iOS/Android PWA cookie/redirect checks. Simulations are development evidence only.
- Approved credential/token lifecycle, encrypted storage where needed, revocation/account deletion/server notifications, data inventory/retention/transfer/provider/legal review; existing abuse/BFF/CSRF/MFA/platform gates remain independent. No assertion here resolves legal applicability.

## Current state / rollback
The owner delegated the narrow profile choice and Engineering selected the nonce-based confidential-client development adapter. AppleOidc implements the internal protocol slice with signed tests; the separately requested0008 adds provider-bound persistence. HTTP/browser-binding integration remains absent, metadata false/routes404. No new key/account/remote provider configuration or dependency. Remove the unused provider/adapter to roll back this slice; no data effect. Actual API deployment/check evidence is recorded in PROGRESS. Do not mark T004/T040 DONE or automatically execute later slices.
