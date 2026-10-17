# V4.99.1 — login lifecycle follow-through

Authorized by the owner's 17 October instruction to diagnose the pause, fix it and resume the full-stack review. Baseline develop `6144662f221ef97f3da39e5b3a193acd4ad6f54b`. Develop only; root/API/Admin `4.99.1`, Resident/Guard `4.99.1+49901`.

## Pause diagnosis and continuation correction

V4.99 was complete: implementation #1429 and evidence #1430 merged, CI 39039595667 passed, develop was clean and there were no open PRs. No approval, failed workflow or image read was blocking it. The assistant ended the turn after its three scoped findings, although the owner had authorized the broader review. No worker continued after that final response. This was a workflow handoff pause, not another CI failure. The supplied image exists at its absolute attachment path and is unrelated to the code work.

Track unreviewed call paths separately from completed milestones and actual external dependencies. Resume from the exact merged source, inspect the next call path and implement verified defects before closure. Do not turn an external acceptance blocker into another repository readiness wrapper, or claim background execution after a final response. This continuation inspected the previously untouched Provider session client plus all four web OTP entry paths and found the defects below.

## Verified continuation scope

| Call path | Prior gap | Correction |
| --- | --- | --- |
| Provider restore/logout and authenticated requests | The bespoke Provider client was outside V4.99's canonical Admin fix. Late restore could overwrite/erase a replacement login, logout could remove it, and old authenticated reads/writes were not tied to current Provider storage. | Keep Provider storage separate. Require the exact current Provider credentials before requests and after responses. Bind restore saves/cleanup to its captured storage snapshot and mounted effect. Conditionally clear logout state, preserve replacement credentials, and invalidate obsolete workspace state on storage/focus. Require actual credential strings, preserving valid API shapes. |
| Admin, Auditor, Provider and Partner OTP request/verification | State-only busy flags permitted overlapping callbacks; phone/OTP inputs remained mutable during pending requests; late replies could authenticate after unmount or overwrite a newer login. | Share a synchronous single-flight, generation/mount and original-storage ownership guard. Freeze pending input and choice controls. Check ownership after every auth await before changing stages, accepting a session or navigating. Ignore unmounted/replaced results and report a changed sign-in as recoverable. |
| Admin, Auditor and Provider context selection | Selection buttons were enabled during pending selection and callbacks lacked login ownership checks. | Reuse the same guarded attempt; disable all choices while pending; reject late selections. Preserve existing role filters and server-verified provider/agent authorization. Partner login remains on its dedicated endpoint and storage slot. |

The login helper holds no server authority, creates no automatic retry and does not combine storage namespaces. Successful callbacks explicitly mark acceptance so their intentional storage write is not reported as a conflicting login. Cleanup invalidates old attempts and removes Provider storage/focus listeners. Existing OTP/challenge, session, membership, selection and navigation APIs remain unchanged.

## Validation and review queue

Status: MERGED to develop through [PR #1431](https://github.com/auraakart/Aaraaweb/pull/1431), with no CI correction commit. Thirty-two new browser cases exercise the actual four login surfaces: duplicate submits, frozen inputs, changed storage during challenge/verification/selection, unmounted verification, incorrect-code recovery and normal login destinations, plus Provider restore/logout/focus cases.

Protected [CI 39043793706](https://github.com/auraakart/Aaraaweb/actions/runs/39043793706) completed successfully for exact head `82102c4d5321dcca83641846494bd081d8704ae5` (`pull_request`, `.github/workflows/ci.yml`). Actual develop merge `2c164afb87f6aa8c5ab37bc1415fb427fe121c4d` retains the tested tree `85787683b45264c31a1de1a3fb5fafaa7083c854`.

| Verification | Result |
| --- | --- |
| Admin actual-component browser tests | 166 passed, including all 32 new login lifecycle cases |
| Existing canonical Admin session tests | 18 passed; Partner session parser and Provider quote identity regressions also passed |
| Full API suite | 2,440 passed; 15 existing intentional skips; 435 files passed and 2 skipped |
| API risk suite | 86 passed across 11 files; dedicated database checks passed |
| Resident and Guard | Full analysis and test jobs passed |
| Admin build and SSR | Build passed; actual Next SSR/cookie/proxy checks and TLS 1.3 ingress checks passed |
| Repository and dependencies | All 44 local stable checks, current release/privacy/hygiene checks, protected structure, preflight, dependency security and required merge gates passed |

The Android base TEST smoke job was scope-skipped, not device acceptance. No local browser/Flutter bootstrap or demo rebuild was needed.

Reviewed continuation queue: canonical Admin session client (V4.99 complete); Provider session lifecycle (V4.99.1 merged); Admin/Auditor/Provider/Partner OTP and selection (V4.99.1 merged). Subsequent full-stack review must start from this merged source and identify a new demonstrated defect before opening another implementation milestone. The broader codebase is not certified defect-free by these scoped checks. This ledger distinguishes actual completion from an unstarted background task; no background execution is implied.

No API runtime, dependency, schema, tenant inventory, native toolchain or financial authority change. Existing independent onboarding/accountant/user/device/AI acceptance, accepted Services commercial decisions and external V5 TEST/partner evidence in #1380 remain actual missing inputs. They are not counted as completed by browser fixtures. Staging/main, published demo, productionization and iOS remain unchanged.
