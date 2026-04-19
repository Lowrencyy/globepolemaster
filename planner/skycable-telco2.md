# Telco 2 / SkyCable — Missing Modules and Extended Planner

## 1. Current Strength of Telco 2

Telco 2 is already strong in its core teardown logic because it already has:

- Project
- Node
- Pole
- Pole Span
- Teardown Log
- Teardown Images
- Component Recovery
- Pole completion logic

The current app correctly treats teardown as **span-based**, because cable exists **between poles**, not directly on the pole record. Existing docs also separate:

- expected engineering values on `pole_spans`
- actual field results on `teardown_logs`

This is a good foundation and should be preserved.

---

## 2. What Is Still Missing

Telco 2 still needs these major layers to become a full operations platform:

- Validation Layer
- GPS / Geo-tagged Evidence Layer
- Inventory Reconciliation Layer
- Warehouse / Delivery Validation Layer
- Permitting Tracking Layer
- Project Reporting Layer
- Acceptance / Compliance Layer
- Role and User Relationship Layer
- Pole Owner / Validation-safe Preview Layer

---

## 3. Missing Module: Validation Layer

### Problem
Current flow has teardown logs and images, but validation is still too thin.

### Add
- validation status
- validated by
- validation date
- validation remarks
- rejected reason
- evidence completeness checker
- approval history

### Recommended statuses
- submitted
- for_validation
- approved
- rejected
- needs_revision
- validated_complete

### Validation checks
- before image present
- after image present
- pole tag present
- both poles documented
- missing cable proof present if unrecovered cable exists
- timestamps complete
- start and finish time complete

---

## 4. Missing Module: GPS / Geo-Tagged Evidence Layer

### Problem
Current Telco 2 docs mention GPS and map support as future improvements, but the project scope already expects geo-tagged evidence.

### Add
- gps_latitude
- gps_longitude
- embedded datetime
- gps_map_image
- location accuracy
- captured device metadata
- pole photo coordinates

### Per evidence record should support
- image_path
- pole_id
- teardown_log_id
- photo_type
- captured_at
- gps_lat
- gps_lng
- embedded_datetime
- uploaded_by

---

## 5. Missing Module: Inventory Reconciliation Layer

### Problem
Current system tracks collected cable and components, but not yet a complete inventory reconciliation model aligned with project deliverables.

### Add
Per node:
- recovered cable
- unrecovered cable
- missing cable
- actual strand length
- expected strand length
- recovered active devices
- recovered passive devices
- missing active devices
- missing passive devices

### Recommended tables
- `node_inventory_summaries`
- `recovery_logs`
- `component_inventory_logs`

### Important categories
- cable
- active devices
- passive devices
- accessories
- hardware

---

## 6. Missing Module: Warehouse / Delivery Validation Layer

### Problem
The scope explicitly includes:
- hauling logs
- sorting and segregation
- transport
- staging warehouse
- delivery to TVPH warehouse

But Telco 2 currently has no proper in-house warehouse validation workflow.

### Add new module
## Warehouse Validation Module

### Main purpose
Validate that recovered items from field teardown were actually:
- hauled
- sorted
- received in staging warehouse
- transferred
- delivered to final destination

### Main workflow
1. Field team submits teardown log
2. Recovered materials are grouped per node / span / batch
3. Warehouse receives batch
4. Warehouse validates actual received materials
5. Warehouse marks:
   - complete
   - partial
   - discrepancy
   - damaged on arrival
6. Delivery or transfer record is created
7. Final receiving validation is completed

### Recommended statuses
#### Hauling status
- pending_pickup
- picked_up
- in_transit
- delivered_to_staging
- delivered_to_final

#### Warehouse validation status
- pending_receipt
- received_complete
- received_with_discrepancy
- damaged
- validated

### Recommended tables
- `haul_batches`
- `haul_batch_items`
- `warehouse_receipts`
- `warehouse_validations`
- `delivery_transfers`

### Key fields
#### `haul_batches`
- id
- project_id
- node_id
- batch_code
- picked_up_by
- pickup_time
- source_type
- source_reference_id
- status

#### `warehouse_receipts`
- id
- haul_batch_id
- warehouse_id
- received_by
- received_at
- remarks
- validation_status

#### `warehouse_validations`
- id
- warehouse_receipt_id
- expected_cable
- received_cable
- expected_node
- received_node
- expected_amplifier
- received_amplifier
- expected_extender
- received_extender
- expected_tsc
- received_tsc
- discrepancy_notes
- validated_by
- validated_at

### Why this matters
This matches the scope’s required:
- hauling logs
- sorting and segregation
- transport
- staging warehouse
- inventory logs
- temporary storage and secured custody

---

## 7. Missing Module: Permitting Tracking Layer

### Problem
The scope explicitly includes permitting works, but Telco 2 does not yet have a permit tracker.

### Add
## Permitting Tracking Module

### Permit types
- site permit
- LGU permit
- barangay permit
- HOA permit
- traffic re-routing permit

### Recommended statuses
- not_started
- in_preparation
- submitted
- approved
- rejected
- expired
- renewed

### Recommended tables
- `permits`
- `permit_requirements`
- `permit_attachments`

### Key fields
#### `permits`
- id
- project_id
- node_id nullable
- permit_type
- permit_number
- issuing_authority
- submitted_at
- approved_at
- expiry_date
- status
- remarks

#### `permit_attachments`
- id
- permit_id
- file_path
- uploaded_by
- uploaded_at
- attachment_type

### Dashboard outputs
- ongoing projects with missing permits
- expiring permits
- pending permit approvals
- blocked nodes due to permit issues

---

## 8. Missing Module: Project Reporting Layer

### Problem
The scope explicitly requires **Project Status Reports**, but current Telco 2 design is teardown-heavy and reporting-light.

### Add
## Project Reporting Module

### Purpose
Generate reporting views for:
- project manager
- client admin
- backend ops
- warehouse team
- validator

### Recommended reporting sections
#### Project level
- total nodes
- total poles
- total spans
- completed spans
- pending spans
- blocked spans
- project progress %
- pending validations
- pending permits

#### Node level
- total expected cable
- total recovered cable
- total unrecovered cable
- total missing cable
- total expected components
- total collected components
- total missing components
- warehouse receipt status
- acceptance doc status

#### Ops reporting
- teardown completed today
- missing cable exceptions
- component recovery discrepancies
- delayed nodes
- nodes ready for acceptance
- nodes waiting for warehouse validation

### Recommended tables
- `project_reports`
- `node_progress_snapshots`
- or generate these dynamically from summary views

---

## 9. Missing Module: Acceptance / Compliance Layer

### Problem
The scope requires acceptance docs per node, but current Telco 2 does not yet organize them as a formal checklist.

### Add
## Acceptance Document Tracker

### Required docs per node
- inventory report
- certificate of completion
- vicinity map
- red-lined site plan
- pole photos report
- RTD file
- geo-tagged before/after photos
- materials return slip

### Recommended statuses
- missing
- partial
- uploaded
- under_review
- approved

### Recommended table
- `node_acceptance_documents`

### Key fields
- id
- node_id
- document_type
- file_path
- status
- uploaded_by
- uploaded_at
- reviewed_by
- reviewed_at
- remarks

---

## 10. Missing Module: Pole Owner Validation-safe Preview

### Problem
Pole owners like Meralco, Globe, PLDT, Converge should be able to validate that teardown happened, but should not see internal SkyCable workflow data.

### Add
## Pole Owner Validation Preview

### Safe fields only
- pole_id
- pole_tag
- owner_type
- attached_telco
- project_name
- node_id
- embedded_datetime
- province
- city
- barangay
- gps_map_image
- before_image
- after_image
- last_audit_date
- validation_summary

### Must not show
- internal teardown status
- internal remarks
- component accounting internals unless allowed
- user comments
- internal project notes

### Recommended table
- `evidence_previews`

---

## 11. User Role Relationships

### Add proper role model
The system needs role-based access because future improvements in the current doc also point toward team/user auth roles and audit trail improvements.

## Recommended top-level roles

### 1. Super Admin
Can:
- manage all clients
- manage all projects
- manage permissions
- manage global configurations
- view all modules

### 2. Client Admin (SkyCable)
Can:
- manage SkyCable users
- manage projects
- manage nodes
- manage poles and spans
- review dashboards
- review warehouse and validation summaries

### 3. Project Manager
Can:
- manage assigned projects
- monitor node progress
- monitor permits
- monitor validations
- monitor reporting
- review project status reports

### 4. Field Auditor / Field Team
Can:
- access assigned project and node
- view assigned poles and spans
- submit teardown logs
- upload before/after/pole-tag/missing-cable images
- cannot validate their own submission

### 5. Validator
Can:
- review teardown logs
- approve or reject
- review evidence completeness
- review exceptions
- cannot edit core engineering setup

### 6. Warehouse Staff
Can:
- receive hauled materials
- validate received materials
- create discrepancy reports
- update warehouse receipts
- confirm transfer and delivery states

### 7. Warehouse Validator / Inventory Controller
Can:
- compare expected vs received
- approve warehouse receipt
- mark discrepancy / partial / damaged
- validate node-level inventory completeness

### 8. Permit Coordinator
Can:
- create permit records
- upload permit attachments
- update permit statuses
- monitor expiring or blocked permits

### 9. Reporting / Ops Analyst
Can:
- view summaries
- export reports
- monitor dashboards
- review node/project performance
- no direct field editing

### 10. Pole Owner Viewer
Can:
- view safe preview only
- review before/after evidence
- review pole tag and map image
- cannot view internal SkyCable operational data

---

## 12. Recommended Role Relationships

### User belongs to:
- one or many clients

### User may have:
- one or many roles

### User may be restricted by:
- project
- node
- region
- province
- city
- barangay

### Recommended relationship tables
- `users`
- `roles`
- `permissions`
- `client_user`
- `user_roles`
- `user_area_assignments`
- `user_project_assignments`
- `user_node_assignments`

### Important rules
- field team should only see assigned nodes or spans
- validator should not submit field logs
- warehouse should not modify field teardown data
- pole owner viewer should only access preview-safe records
- permit coordinator should not see subscriber-side client internals

---

## 13. Final Extended Telco 2 Layer

### Core Teardown Layer
- projects
- nodes
- poles
- spans
- teardown logs
- teardown images
- component recovery

### Added Operations Layer
- validation queue
- geo-tagged evidence
- inventory reconciliation
- warehouse validation
- delivery transfer
- permitting tracker
- project reporting
- acceptance document tracker
- role-based access
- pole-owner safe validation preview

---

## 14. Final Build Order

### Stage 1
- keep current span-based model
- add validation module
- add geo-tagged evidence fields

### Stage 2
- add inventory reconciliation
- add warehouse receiving and validation

### Stage 3
- add delivery / transfer records
- add permit tracking

### Stage 4
- add project reporting and node summaries
- add acceptance document tracker

### Stage 5
- add role and relationship enforcement
- add pole-owner validation-safe preview