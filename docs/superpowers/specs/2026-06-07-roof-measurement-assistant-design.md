# Roof Measurement Assistant Design

## Goal

Build an internal review workflow that turns a property address and notes into a visible, auditable roof measurement packet. The app supports pre-quote screening and quote-ready manager approval, with uncertainty shown plainly instead of hidden.

## Product Boundary

The V1 app is a quote-input approval tool, not an automated production takeoff system. It stores draft measurements, evidence, risk flags, manual corrections, approvals, and exports. Supplier orders, crew packets, payment/pricing approval, and fully automated no-review takeoffs are out of scope.

## Stack

- Next.js App Router with TypeScript
- shadcn/ui on Radix primitives for the internal product UI
- Tailwind CSS for layout and theme tokens
- Supabase Postgres as the backend source of record
- `@supabase/ssr` and `@supabase/supabase-js` for server/browser clients
- Vitest for domain logic tests

## Data Model

- `properties`: address, customer/job notes, structure toggles, current workflow mode/status
- `measurement_drafts`: generated estimates for roof squares, pitch, waste, complexity, confidence, and status
- `measurement_evidence`: public/paid/manual source records, source labels, URLs, and confidence contribution
- `measurement_risk_flags`: explicit review risks such as assumed pitch, low imagery confidence, included detached structure, or manual check needed
- `measurement_approvals`: manager-approved quote inputs, reviewer notes, approver identity, approval timestamp
- `measurement_audit_events`: append-only history for intake, draft generation, edits, approvals, and exports

## Core Flow

1. Create property with address, notes, and include-garage/include-shed choices.
2. Generate a draft measurement from the best available provider adapter.
3. Show a review packet with evidence, draft totals, pitch assumptions, and risk flags.
4. Let the manager correct roof squares, pitch class, structures, complexity, waste, confidence, and notes.
5. Approve quote inputs and record an audit event.
6. Export/share a readable approved measurement summary.

## V1 Data Strategy

V1 ships with a deterministic draft provider so the workflow is usable immediately. It creates conservative draft measurements from address/structure inputs and marks them as needing review. Later adapters can add Google Solar API, parcel/building footprints, public LiDAR, licensed aerials, or paid reports behind the same provider interface.

## UI Screens

- Property intake: address, customer/job notes, mode, garage/shed toggles
- Measurement review packet: evidence, draft totals, pitch assumptions, detected/included structures, risk flags
- Approval panel: approved squares, pitch class, waste %, complexity, confidence, reviewer notes
- History/audit: source data, manual edits, approval timestamp, approver

## Error Handling

Missing Supabase environment variables show a clear setup state while still allowing the UI to render. Draft generation failures produce a reviewable manual packet rather than blocking the manager. Every approval stores the approved values, not just a diff from the draft.

## Testing

Domain tests cover draft generation, confidence/risk flag behavior, and approval summary formatting. App-level verification checks that the intake/review/approval flow renders cleanly across desktop and mobile.
