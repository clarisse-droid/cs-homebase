# Phase 1: Monday.com discovery (17 Nov 2026)

Inspected read-only through an authorised Monday.com connection. **Nothing was created, edited, moved, archived or deleted.**

## What actually exists

The brief described "one parent item per client, with units and tasks underneath". The real account is organised differently:

| Board | Workspace / folder | What it holds | Used for |
|---|---|---|---|
| **Master Client Sheet** `9242064148` | Customer Success | 181 clients. Status, Health, Touch Point, Plan, CSM, Start Date, Last Touch Date, payment amounts, Business Structure Type, links to Properties | Clients, journey stage, payment, communication risk |
| **Properties** `8700182741` | Customer Success | 84 units/listings, linked back to clients ("Active Clients") | Units |
| **Actively Looking** `9109659907` | Customer Success | 30 clients searching for properties (linked to Master sheet) | Stage 6 corroboration |
| **Project boards** "Project <Building> - <City>" | Project Manager → *In-progress* folder `13908724` | ~60 setup tasks + subtasks per **building** (keys, furniture, wifi, utilities, tech, photography, launch, invoicing). Status: Done / Working on it / Working subitem / Not Started | Unit setup readiness |
| **Tech onboarding boards** "<Client> - <Building>" | Vacarya Operations → folder `21017459` | ~37 per-client steps (Hostaway, SuiteOp, PriceLabs, HelloHost). Status: Done / Stuck / Not Needed / Working on it | Unit setup readiness (tech) |
| Completed project boards | Project Manager → *Completed* `13908722` | Historical buildings | Not synced by default (add folder id to include) |
| Transfers, Off-boarding, Royalty Recon, Guest boards, Marketing | various | Out of scope for v1 | — |

### Status values found (Master Client Sheet "Status")
Active 80 · Churn 73 · Structure Setup 10 · Onboarding 6 · Actively Looking 6 · Setting up units 6. Also defined but unused today: *Onboarding Call Completed*, *Working on it*, *No Payment*.

## Data model mapping

```
Master Client Sheet item ──(link to Properties)──▶ Properties item  = UNIT
        │
        └─(board_mappings, CS-confirmed)──▶ Project board (building)      ──▶ tasks/subtasks
                                       └──▶ Tech onboarding board (client) ──▶ tasks/subtasks
```

Monday has **no explicit link** between a client and the project or tech boards. The app suggests links from board names (21 of 22 tech boards and 9 project links matched on today's data) and **CS confirms them** in Settings → Board links. A link can be restricted to specific units, because project boards are building-level and shared by several clients.

## Journey stage rules (all configurable in Settings → Business rules)

| Stage | Evidence used | If no evidence |
|---|---|---|
| 1 Sales Call | Client record exists with a Closer | Needs Verification |
| 2 Payment Received | Upfront Payment Made ≥ $25,000, or ≥ Cost of Membership (payment plans). Status "No Payment" = blocked | Needs Verification |
| 3 Onboarding Call | Status Onboarding = current; any later status = complete | — |
| 4 Business Structure | Status Onboarding Call Completed / Structure Setup = current | — |
| 5 Lease Application | **Not tracked in Monday** | Needs Verification until CS records it |
| 6 Actively Looking | Status Actively Looking; corroborated by the Actively Looking board | — |
| 7 Unit(s) Chosen | Properties linked to the client | Conflict alert if status is later but nothing is linked |
| 8 Unit Setup | Status Setting up units; per-unit readiness from mapped boards | — |
| 9 Launch Call | **Not tracked in Monday** | Needs Verification until CS records it |
| 10 Operating | Status Active. Full launch needs **all** units operating (switch to "any" for partial launches) | Conflict alert when Active but units aren't operating |

CS-recorded completions are stored in the app and labelled **CS-recorded**. They never become Monday data.

## Unit readiness

* Task state mapping: Done → done · Not Needed → excluded · Stuck → blocked · Working on it / Working subitem → in progress · Not Started / empty → not started.
* **Readiness % = Done top-level tasks ÷ top-level tasks**, excluding Not Needed, the launch task and post-launch admin (final invoice, design payout, bookkeeper tracker, return labels).
* Subtasks count toward Blocked and Overdue only.
* Status: launch task Done → **Operating** · any Stuck → **Blocked** · readiness ≥ 95% → **Ready for Launch** · any progress → **In Progress** · else **Not Started**. No board linked → **Needs Verification**.

## Gaps and inconsistencies found

1. **No client ↔ setup board link** in Monday (handled with confirmed mappings).
2. **Project boards are per building, not per unit**, so readiness is shared by every unit in that building unless a mapping is restricted.
3. **Due dates are almost never filled** on project boards, so overdue detection only works where Ops set dates. Recommend Ops add due dates to key milestones.
4. **Sales call, lease application and launch call** have no Monday field.
5. **Assigned owner** on project boards is a free-text column (`text__1`), mostly empty; the tech boards use a status column ("Assignee") instead of a people column.
6. Status changes have **no history** in the fields we read. "Days in stage" starts counting from the first sync that observes a change.
7. 156 of 181 clients have **no CSM** set.
8. Currency: Monday stores payments in **$** (the brief mentions £25,000). The threshold and symbol are configurable.
9. One tech-onboarding board has no matching client name in the Master sheet.
10. **Sensitive data on the Master sheet** (bank account/routing numbers, date of birth, EIN files, mailing address) and on the Onboarding Dashboard (passwords). These are **excluded by column allowlist** and never read.
