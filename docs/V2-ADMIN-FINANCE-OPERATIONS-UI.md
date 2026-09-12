# Aaraagate V2 Admin Finance Operations UI

This slice extends the existing Admin finance experience without replacing the stable receivables workspace.

## Route

- `/finance` remains the receivables, ageing, settlements, late-fee and accounting overview.
- `/finance/operations` adds expense, payable, budget, fund-utilization and export operations.

## Access model

The UI mirrors backend authorization but does not replace it.

- `FINANCE_READ`: read-only access to expenses, payables, budgets, actuals, fund utilization and finance export.
- `FINANCE_MANAGE`: create/approve/post expenses, record payable settlements, and create/approve/lock budgets.
- `SOCIETY_ACCOUNTING` entitlement is required for the Finance shortcuts and API surface.

Society Admin and Committee users remain read-only for finance under the current role mapping. Accountant/Treasurer and Super Admin can perform finance mutations.

## Financial integrity

The UI never edits posted financial history. Expense posting and payable settlement invoke the validated API contract, which enforces open accounting periods, append-only settlement history and double-entry journal posting.

## UX scope

The operations workspace includes:

- draft expense creation;
- expense register with approve/post actions;
- payable outstanding view and settlement recording;
- budget creation, approval and lock lifecycle;
- budget-vs-actual inspection;
- fund-utilization summary;
- recent posted-journal helper for payable settlement;
- JSON finance snapshot export.

This is intentionally an operational finance console rather than a resident-facing experience.
