# Aaraagate V4.16 — Integration Readiness Contract

Date: 2026-09-18

## Purpose
V4.16 does not duplicate external-provider code that already exists. It makes the existing provider-neutral boundaries machine-checkable so future payment, messaging, storage and smart-gate integrations can be attached without weakening tenant, authorization or accounting invariants.

## Repository-ready boundaries

| Integration | Repository boundary | Current repository proof | External proof still required |
|---|---|---|---|
| Payment gateway | `PaymentGatewayAdapter` | query/refund contract, reconciliation domain separation | merchant credentials, signed live webhooks, settlement evidence |
| WhatsApp | `WhatsAppProvider` | template-send provider port and simulator/test path | approved BSP/Meta account, templates, delivery callbacks |
| Smart gate / ANPR / RFID / barrier | `AccessDeviceAdapter` | vendor-neutral command contract plus simulator | physical device protocol, field latency/failure tests |
| Object storage | `ObjectStoragePort` | S3-compatible adapter with unconfigured/fail-closed path | production bucket/IAM/KMS/lifecycle evidence |

## Invariants
- Domain services do not infer success from client-side or provider UI state.
- Accounting truth stays separate from payment-provider transaction truth.
- Hardware commands remain tenant/gate/device scoped and auditable.
- Missing production configuration fails closed; production must not silently use demo behavior.
- Real provider/hardware acceptance remains external and does not inflate repository-only readiness scores.

The contract is enforced by `integration-readiness.contract.spec.ts`.
