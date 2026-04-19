## globe summary project

## Project Overview

- **globe* needs a **Pole Inventory, NAP Availability, and Teardown Audit System** focused on subscriber-level cable monitoring and teardown operations.
- This is **not** a generic admin dashboard.
- This is an **operations system** for:
  - field teams
  - validators
  - backend users
- Main system purpose:
  - track poles and NAP boxes
  - monitor active, inactive, and free slots
  - find available NAPs for new installations
  - audit disconnected, damaged, or replaced subscriber cables
  - create teardown tickets with before/after proof
  - validate that cables were actually removed from poles
- This direction aligns with the uploaded scope, which includes:
  - site survey
  - extraction/recovery
  - inventory logs
  - geo-tagged photos
  - pole-level documentation
  - project status reporting :contentReference[oaicite:0]{index=0}

---

## Scope for Telco 1

- Telco 1 covers:
  - subscriber cables of disconnected accounts
  - damaged or cut cables
  - replacement cases where old cables remain attached to poles
- Telco 1 does **not** mainly focus on full teardown of all network equipment of a closed telco.
- Main focus:
  - subscriber-line cleanup
  - audit tracking
  - validation of cable removal

---

## Main Goals

- Know which poles and NAP boxes are already surveyed or audited.
- See which NAPs still have:
  - active slots
  - inactive slots
  - free slots
- Help teams find the nearest available NAP for installation.
- Track old cables that should be removed to avoid continued attachment cost.
- Validate teardown work through:
  - status updates
  - before/after evidence

---

## Recommended Backend Approach

- Use **Laravel as an API-first backend**.

### Why API-first fits this project

- Web dashboard and mobile app can share the same backend.
- Frontend and business logic stay separate.
- Easier to scale for:
  - backend team
  - field team
  - validators
- Easier to expand later for **Telco 2**.

### Suggested setup

- **Laravel API** for business logic and data
- **Frontend app** for dashboard and mobile UI
- **Token-based authentication**
- **REST API endpoints** for:
  - areas
  - poles
  - NAP boxes
  - slots
  - tickets
  - validations

---

## Tools and Integrations

### Backend

- Laravel
- Laravel API
- Authentication layer for:
  - admin
  - field
  - validator

### Frontend / UI

- Tailwind CSS
- Responsive dashboard layout
- Mobile-friendly status cards and forms

### Mapping / Geography

- **PSA PSGC API**
- **GeoJSON boundary files**
- **Leaflet**

### Best usage of mapping tools

- **GeoJSON** = area boundaries only
- **Database/API** = pole and NAP details
- **Leaflet** = render boundaries and pole markers together

---

## Area Management

- Area hierarchy:
  - Region
  - Province
  - City / Municipality
  - Barangay

### Purpose

- filter by location
- display boundaries on the map
- load poles and NAPs per selected area

### Map behavior

- User selects:
  - Region
  - Province
  - City / Municipality
  - Barangay
- System should:
  - load the selected boundary
  - zoom to the selected area
  - display all poles inside that boundary
  - allow clicking each pole marker for details

---

## Core Modules

### 1. Pole Inventory

Each pole should have:

- Pole ID
- Pole Name / Pole Number
- Coordinates
- Region
- Province
- City
- Barangay
- Audit Status
- Last Audited Date
- Last Audited By
- Linked NAP Box

### 2. NAP Box Inventory

Each NAP box should have:

- NAP Box ID
- Linked Pole
- Total Slots
- Active Count
- Inactive Count
- Free Slot Count
- Current NAP Status
- Last Updated

### 3. Slot and Client Availability

Purpose:

- help the installation team identify available slots
- support search by area or address
- help confirm nearest available NAP

Basic flow:

1. Search area or address
2. Find nearest NAP box
3. Check free slots
4. Once installed, free slot becomes active

### 4. Teardown Ticketing

Purpose:

- track disconnected subscriber cables
- track damaged cables
- track replacement cases
- track abandoned old subscriber lines
- document field work
- update NAP and slot status
- preserve audit trail

### 5. Validation Queue

Purpose:

- review teardown work
- confirm evidence completeness
- approve or reject submitted tickets

---

## Dashboard Direction

- The dashboard should be a **NAP / Pole Operations Dashboard**.

### Do not use

- crypto widgets
- trading charts
- generic analytics components that do not match field operations

### Use instead

- summary cards
- area filters
- map view
- area summaries
- work queues
- NAP status cards
- teardown monitoring
- validation counters

---

## Recommended Summary Cards

Top dashboard cards should include:

- Total Poles
- Audited Poles
- Unaudited Poles
- Total NAP Boxes
- Active Slots
- Inactive Slots
- Free Slots
- For Teardown
- Pending Validation

This matches the uploaded scope’s emphasis on site/node tracking, survey, extraction, and reporting. :contentReference[oaicite:1]{index=1}

---

## Dashboard Sections

### Row 1 — Summary

- KPI cards for:
  - poles
  - audits
  - NAPs
  - slots
  - teardown
  - validation

### Row 2 — Area + Map

- Left side:
  - Region filter
  - Province filter
  - City / Municipality filter
  - Barangay filter
- Right side:
  - Leaflet map
  - area boundaries
  - pole markers

### Row 3 — Area Summary

Per selected area, show:

- total poles
- audited poles
- unaudited poles
- active slots
- inactive slots
- free slots
- teardown count

### Row 4 — Work Queues

- poles not yet audited
- NAPs with inactive clients
- NAPs with free slots
- tickets pending validation
- records missing evidence
- recently updated NAPs

### Row 5 — Teardown Monitoring

- submitted tickets
- ongoing tickets
- completed tickets
- rejected tickets
- missing before/after proof

---

## Color Coding

Use the following status colors:

- **Green** = Active
- **Red** = Inactive / For Teardown / Damaged
- **Orange** = Free Slot
- **Blue** = Audited / Verified
- **Gray** = Not Audited / No Data

---

## Recommended Data Relationship

Use this main relationship:

- **Region → Province → City → Barangay → Pole → NAP Box → Slot → Client → Account Number → Ticket**

### Benefit

When account number is selected, the system can auto-display:

- client
- pole
- NAP box
- slot
- current statuses

---

## Required Status Groups

### NAP Status

- Available
- Partially Used
- Full
- Faulty
- For Audit
- For Teardown
- Teardown Completed

### Slot Status

- Free Slot
- Active
- Inactive
- Disconnected
- For Teardown
- Teardown Completed

### Account Status

- Active
- Disconnected
- Suspended
- Replaced

### Ticket Status

- Draft
- Submitted
- For Validation
- Approved
- Ongoing
- Completed
- Rejected

### Audit Status

- Not Audited
- Audited
- Needs Re-Audit
- Incomplete Survey

---

## Teardown Ticket Fields

### Auto-filled

- Ticket Number
- Account Number
- Client Name
- Client Address
- Pole Name
- Pole ID
- NAP Box ID
- NAP Slot
- Area / Barangay
- Current Account Status
- Current Slot Status
- Current NAP Status
- Coordinates

### Editable / Required

- Teardown Reason
- New NAP Status
- New Slot Status
- Ticket Status
- Status Change Reason
- Before Photo
- After Photo
- Reported By
- Assigned Lineman
- Time Start
- Time End
- Remarks

### Validation

- Validation Status
- Validated By
- Validation Date
- Validation Remarks
- Attachment Removed? Yes/No

---

## Teardown Reasons for Telco 1

Recommended values:

- Disconnected
- Replacement
- Damaged
- Abandoned

---

## Important Ticket Logic

Each ticket should show both current and updated statuses.

### Required fields

- Current NAP Status *(read-only)*
- New NAP Status *(required)*
- Current Slot Status *(read-only)*
- New Slot Status *(required)*

### Save behavior

When the ticket is saved or completed:

- latest NAP status is updated
- latest slot status is updated
- ticket history remains for audit trail

---

## Audit Tracking Requirements

Track the following:

- total poles audited
- total poles not yet audited
- last audit date
- last audited by
- needs re-audit
- incomplete survey
- missing GPS
- missing pole tag

This matches the scope’s site survey and pole-level documentation requirements. :contentReference[oaicite:2]{index=2}

---

## Evidence Completeness

Each ticket should be checked for:

- before photo
- after photo
- coordinates
- pole number
- linked account
- linked NAP
- time start
- time end

The scope requires pre/post geo-tagged photographs, coordinates, and pole number documentation. :contentReference[oaicite:3]{index=3}

---

## Mobile / Field UX Direction

Keep field actions fast and simple.

### Recommended principle

- **3 taps max** for common actions

### Installation flow

1. Search area or address
2. Select nearest NAP
3. Choose slot / confirm

### Teardown flow

1. Search account / pole / ticket
2. Open linked record
3. Update status + upload before/after

---

## Tailwind UI Direction

Recommended visual style:

- white cards
- rounded corners
- soft shadows
- strong status badges
- clean spacing
- responsive layout
- map + summary + queue layout

---

## Not Included Yet

For Telco 1 summary, these are intentionally deferred for now:

- inventory recovery details
- billing tracker
- invoice readiness
- advanced asset accounting

Billing-related documentation exists in the uploaded scope, but it is intentionally excluded from the first version to keep the scope focused. :contentReference[oaicite:4]{index=4}

---

## Suggested Build Order

### Phase 1

- area hierarchy
- GeoJSON boundaries
- Leaflet map
- pole markers

### Phase 2

- pole inventory
- NAP inventory
- summary cards
- area summaries

### Phase 3

- teardown ticket form
- linked autofill
- status update logic

### Phase 4

- validation queue
- evidence completeness checker
- audit status widgets

### Phase 5

- reports
- role-based views
- future Telco 2 expansion

---

## Final Definition

- **Telco 1** is a **subscriber-cable teardown and NAP audit workflow system** focused on:
  - poles
  - NAP boxes
  - slot availability
  - disconnected or damaged subscriber lines
  - teardown validation
  - field and backend operational tracking

---

## One-line Summary

- Build a **Laravel API-based telco operations system for Telco 1** with:
  - area hierarchy
  - map-based pole view
  - NAP slot availability
  - teardown ticketing
  - audit tracking
  - before/after validation for disconnected, damaged, and replacement subscriber cables