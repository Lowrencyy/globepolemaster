# Globe Telco 1 — README Plan

## Overview

This project is a **Telco 1 / Globe operations platform** focused on:

- pole-based audit workflows
- NAP box and slot visibility
- cable-only span teardown
- subscriber-related disconnect / damage / replacement cases
- before/after evidence collection
- validation workflows
- limited pole-owner preview support

This is **not** a generic admin dashboard.  
It is a field and backend operations system designed to manage actual telco infrastructure activity tied to poles, spans, NAP boxes, and subscriber teardown work.

The overall project direction is grounded in the uploaded scope of work, which includes:

- site survey
- extraction and recovery
- inventory and logging
- geo-tagged documentation
- pole photos
- project status reporting
- acceptance documents :contentReference[oaicite:0]{index=0}

---

## Main Goal

Build a **Globe Telco 1 module** that lets teams:

- search poles and spans by area
- view NAP boxes and slot availability
- identify active / inactive / free slots
- track disconnected or damaged subscriber cable teardown
- capture before/after evidence
- validate that cable has really been removed
- provide a safe validation output for pole owners when needed

---

## Core Business Context

Globe / Telco 1 teardown is:

- **span-based**
- **cable-only**
- tied to poles and NAP workflows
- not focused on collectable components like amplifier, extender, node, or tsc

This is different from the SkyCable workflow, where teardown is also span-based but includes component recovery. The SkyCable docs clearly state that cable exists **between poles**, so teardown must be recorded on **spans**, not directly on poles. :contentReference[oaicite:1]{index=1} :contentReference[oaicite:2]{index=2}

For Globe Telco 1:

- span = teardown coverage / cable grouping
- no component recovery
- status + evidence + validation only

---

## Scope

### Included

- area hierarchy
- pole master view
- shared span master usage
- NAP box visibility
- NAP slot visibility
- account-linked lookup
- cable-only teardown logging
- before/after photo uploads
- pole tag image capture
- GPS map image capture
- validation queue
- dashboard summaries

### Excluded for now

- component recovery
- SkyCable node workflow
- equipment teardown
- billing tracker
- advanced recovery inventory

---

## Shared Architecture Rule

This module follows the platform rule:

- **Pole is shared**
- **Span is shared**
- **NAP is Telco 1 specific**
- **Node is Telco 2 specific**
- **Validation output is shared**

That means Globe Telco 1 will use shared pole and span records, but the Globe operational workflow remains isolated from SkyCable and from pole-owner viewers.

---

## Functional Modules

### 1. Area Management

Purpose:

- filter records by location
- support area-based searches
- support field and backend dashboards

Hierarchy:

- Region
- Province
- City / Municipality
- Barangay

Tools:

- PSA PSGC API
- GeoJSON boundary files
- Leaflet / React Leaflet

---

### 2. Pole Master View

Purpose:

- display all poles relevant to Globe
- show pole metadata and linked infrastructure
- support search and filtering

Typical pole fields:

- pole_id
- pole_tag / pole_code
- latitude
- longitude
- region
- province
- city
- barangay
- owner_type
- remarks

Note: not all poles are owned by Meralco. A pole may belong to:

- Meralco
- Globe
- PLDT
- Converge
- other owners

---

### 3. Span View

Purpose:

- show the cable grouping between poles
- support teardown selection
- support cable-only teardown tracking

A span represents the cable connection between two poles.  
This matches the existing teardown principle that work should be tracked per span, not just per pole. :contentReference[oaicite:3]{index=3}

Typical span fields:

- span_id
- client_id
- from_pole_id
- to_pole_id
- length_meters
- runs
- expected_cable
- span_type
- status

For Globe Telco 1:

- `span_type = telco1_cable_only`

---

### 4. NAP Box Module

Purpose:

- link poles to NAP boxes
- show current telco-side distribution point visibility
- support installation and teardown context

Typical fields:

- nap_box_id
- pole_id
- client_id
- nap_status
- active_count
- inactive_count
- free_count
- last_updated_at

---

### 5. NAP Slot Module

Purpose:

- show actual slot usage
- support availability lookup
- support teardown effect on slot status

Typical fields:

- slot_id
- nap_box_id
- slot_number
- slot_status
- linked_account_id nullable
- last_updated_at

---

### 6. Subscriber / Account Lookup

Purpose:

- connect account-driven workflows to infrastructure
- allow fast search by account number
- auto-fill related records

Expected lookup result:

- account number
- client name
- pole
- NAP box
- slot
- current account status
- current slot status
- current NAP status

---

### 7. Globe Cable Teardown Module

Purpose:

- handle disconnected
- handle damaged
- handle replacement
- handle abandoned cable cases

Because Globe Telco 1 is cable-only, the teardown record should focus on:

- selected span
- selected pole context
- current statuses
- new statuses
- image evidence
- timestamps
- validation handoff

---

### 8. Validation Queue

Purpose:

- review submitted Globe teardown records
- confirm proof completeness
- approve or reject field submissions

Validation should check:

- before photo
- after photo
- pole tag
- embedded date/time
- GPS map image
- pole / span reference
- linked area

This matches the uploaded scope’s emphasis on pre/post extraction photos, pole identification, coordinates, and field documentation. :contentReference[oaicite:4]{index=4}

---

### 9. Dashboard Summary

Purpose:

- give Globe backend team a real operations dashboard
- summarize audit and teardown progress
- track pending validation and missing proof

Recommended cards:

- Total Poles
- Audited Poles
- Unaudited Poles
- Total NAP Boxes
- Active Slots
- Inactive Slots
- Free Slots
- For Teardown
- Pending Validation

---

## Globe Workflow

### A. NAP Availability Flow

1. Search area or address
2. Load nearby poles and NAP boxes
3. View active / inactive / free slots
4. Select available slot
5. Confirm installation
6. Update slot to active

---

### B. Cable Teardown Flow

1. Search by account, pole, or area
2. Load related pole and connected spans
3. Select the span to teardown
4. Capture:
   - before image
   - after image
   - pole tag image
   - GPS map image
5. Update:
   - teardown status
   - slot status if needed
   - NAP status if needed
6. Submit for validation

---

### C. Validation Flow

1. Open submitted teardown record
2. Review evidence
3. Confirm date/time and location
4. Confirm span and pole context
5. Approve or reject

---

## Recommended Statuses

### Pole status

- pending
- in_progress
- completed
- not_audited
- audited

### Span status

- pending
- in_progress
- completed
- blocked

### NAP status

- available
- partially_used
- full
- faulty
- for_audit
- for_teardown

### Slot status

- free
- active
- inactive
- disconnected
- for_teardown
- teardown_completed

### Ticket / teardown status

- draft
- submitted
- for_validation
- approved
- rejected
- completed

---

## Required Evidence

Each Globe teardown record should support:

- before image
- after image
- pole tag image
- GPS map image
- embedded date/time
- area metadata
- last updated by / submitted by
- validation result

This is aligned with the scope’s requirement for geo-tagged and pole-level documentation. :contentReference[oaicite:5]{index=5}

---

## Tools and Apps to Use

### Backend

- Laravel
- Laravel Sanctum
- Laravel Policies / Gates
- MySQL or PostgreSQL
- Laravel Queues
- Laravel Storage
- optional:
  - Spatie Permission
  - Spatie Activity Log

---

### Frontend Web

- Next.js or React
- Tailwind CSS
- Axios or TanStack Query
- optional:
  - shadcn/ui
  - table/grid components
  - modal/image preview components

---

### Mobile / Field App

Choose one:

#### Option A — Recommended long term
- React Native Expo

#### Option B — Faster first release
- responsive web app using the same frontend stack

Field support should include:

- camera capture
- fast form flow
- 3-tap-friendly actions
- offline support later

---

### Mapping / Geography

- PSA PSGC API
- GeoJSON boundary files
- Leaflet / React Leaflet
- optional geocoding provider for address search

---

### Media / Validation

- local or S3-compatible image storage
- image compression
- image preview generation
- embedded date/time display
- GPS metadata support

---

## Suggested Database Design for Globe

### Shared tables used by Globe

- `clients`
- `projects` *(optional if needed for grouping)*
- `regions`
- `provinces`
- `cities`
- `barangays`
- `poles`
- `pole_spans`
- `attachments`
- `validations`
- `evidence_previews`

### Globe-specific tables

- `nap_boxes`
- `nap_slots`
- `client_accounts`
- `telco1_audits`
- `telco1_teardown_logs`

### Key rules

#### `poles`
Shared physical poles used across clients.

#### `pole_spans`
Shared span master used by both telcos, but Globe spans are marked as:

- `span_type = telco1_cable_only`

#### `telco1_teardown_logs`
Stores actual Globe field teardown submissions.

#### `attachments`
Stores Globe teardown images:
- before
- after
- pole_tag
- gps_map
- supporting

---

## Suggested API Groups

### Shared

- `/api/auth/...`
- `/api/areas/...`
- `/api/poles/...`
- `/api/spans/...`
- `/api/attachments/...`
- `/api/validations/...`
- `/api/dashboard/...`

### Globe-specific

- `/api/telco1/nap-boxes/...`
- `/api/telco1/nap-slots/...`
- `/api/telco1/accounts/...`
- `/api/telco1/audits/...`
- `/api/telco1/teardowns/...`

---

## Security Rules

Each request must be filtered by:

- client assignment
- role
- area assignment
- allowed module
- allowed action
- allowed fields

### Globe users can see

- Globe poles
- Globe spans
- Globe NAP boxes
- Globe NAP slots
- Globe teardown logs
- Globe validations

### Globe users cannot see

- SkyCable internal logs
- component recovery data from Telco 2
- pole-owner restricted dashboards unless allowed

---

## Pole Owner / Validation Support

Some Globe records may need to produce a **safe validation preview** for a pole owner such as:

- Meralco
- Globe
- PLDT
- Converge
- other owner types

Safe preview fields may include:

- project_name nullable
- node_id nullable
- pole_tag
- attached_telco
- nap_box_id nullable
- embedded_datetime
- province
- city
- barangay
- GPS map image
- before image
- after image
- last_audit_date

The pole owner must **not** see:

- internal ticket statuses
- internal remarks
- subscriber account details
- full telco workflow data

---

## Planner

### Phase 1 — Foundation

- create clients and permissions
- create area hierarchy
- create poles table
- create shared spans table
- add owner type to poles

### Phase 2 — Globe Infrastructure

- create NAP box table
- create NAP slot table
- create account lookup table
- connect poles to NAP boxes and spans

### Phase 3 — Globe Workflow

- create Globe audit records
- create Globe cable-only teardown logs
- add status update rules
- add before/after/pole tag/GPS uploads

### Phase 4 — Validation

- create validation queue
- create evidence completeness checks
- add validation decisions
- create safe preview output for pole owners

### Phase 5 — Dashboard and Reports

- build summary cards
- build pending validation view
- build audit backlog view
- build NAP utilization reports
- build span teardown reports

---

## Recommended Build Priority

1. Shared poles and spans
2. Globe NAP boxes and slots
3. Globe teardown logs
4. Attachments and validation
5. Dashboard summaries
6. Pole-owner safe preview

---

## Final Definition

Globe Telco 1 is a **pole + span + NAP-based cable teardown platform** where:

- poles are shared infrastructure
- spans define actual teardown coverage
- NAP boxes and slots define subscriber access and availability
- teardown is cable-only
- evidence and validation confirm actual field work
- safe outputs can later be shown to pole owners without exposing internal Globe workflow data