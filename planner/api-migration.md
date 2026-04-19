# Telco Platform API + Database Planner
## Lean, Usable, Relationship-Safe Version

## 1) Project Purpose

Build one **shared Laravel API backend** for:

- **Telco 1 / Globe**
- **Telco 2 / SkyCable**
- **Pole Owners / Meralco, Globe, PLDT, Converge, others**

The backend must support:

- shared pole master data
- shared span master data
- Telco 1 cable-only teardown with NAP and slot workflows
- Telco 2 project/node/span teardown with component recovery
- permit tracking
- warehouse receiving and delivery validation
- validation-safe preview for pole owners

### Core architectural rules

- **Pole is shared**
- **Span is shared**
- **NAP is Telco 1 only**
- **Node is Telco 2 only**
- **Pole owner preview is shared**
- **Do not merge Telco 1 and Telco 2 teardown logs into one table**

This is based on the existing SkyCable logic where the actual work is recorded on **spans**, not directly on poles, and where expected engineering values are separated from actual field submissions. :contentReference[oaicite:6]{index=6} :contentReference[oaicite:7]{index=7}

---

## 2) Tables to Create
## Only create these tables

### A. Security / Client Core

#### `clients`
Purpose:
- all clients in the platform

Fields:
- id
- client_name
- client_code
- client_type
- is_active
- created_at
- updated_at

Examples:
- Globe
- SkyCable
- Meralco
- PLDT
- Converge

---

#### `client_configs`
Purpose:
- enable or disable modules per client

Fields:
- id
- client_id
- supports_nap_module
- supports_node_module
- supports_component_recovery
- supports_permitting
- supports_warehouse_validation
- supports_owner_preview
- requires_before_after
- requires_pole_tag_photo
- requires_gps_map_image
- created_at
- updated_at

---

#### `users`
Fields:
- id
- name
- email
- password
- status
- created_at
- updated_at

---

#### `roles`
Fields:
- id
- role_name
- role_code
- created_at
- updated_at

Examples:
- super_admin
- client_admin
- project_manager
- field_team
- validator
- warehouse_staff
- warehouse_validator
- permit_coordinator
- pole_owner_viewer

---

#### `user_roles`
Fields:
- id
- user_id
- role_id
- client_id nullable
- created_at
- updated_at

---

#### `client_user`
Purpose:
- user-to-client assignment

Fields:
- id
- client_id
- user_id
- status
- created_at
- updated_at

---

#### `user_area_assignments`
Purpose:
- area restrictions per user

Fields:
- id
- user_id
- region_id nullable
- province_id nullable
- city_id nullable
- barangay_id nullable
- created_at
- updated_at

---

#### `user_project_assignments`
Purpose:
- project restrictions for Telco 2

Fields:
- id
- user_id
- project_id
- created_at
- updated_at

---

#### `user_node_assignments`
Purpose:
- node restrictions for Telco 2

Fields:
- id
- user_id
- node_id
- created_at
- updated_at

---

### B. Area Hierarchy

#### `regions`
Fields:
- id
- psgc_code
- region_name
- region_code
- created_at
- updated_at

#### `provinces`
Fields:
- id
- region_id
- psgc_code
- province_name
- province_code
- created_at
- updated_at

#### `cities`
Fields:
- id
- province_id
- psgc_code
- city_name
- city_code
- created_at
- updated_at

#### `barangays`
Fields:
- id
- city_id
- psgc_code
- barangay_name
- barangay_code
- created_at
- updated_at

Purpose:
- normalize location hierarchy
- support PSGC-based filtering
- support permit and project reporting

---

### C. Pole Owners

#### `owners`
Purpose:
- real list of pole owners

Fields:
- id
- owner_name
- owner_code
- owner_type
- is_active
- remarks nullable
- created_at
- updated_at

Examples:
- Meralco
- Globe
- PLDT
- Converge
- Other

---

#### `pole_owner_maps`
Purpose:
- map a pole to a pole owner

Fields:
- id
- pole_id
- owner_id
- effective_date nullable
- source_reference nullable
- remarks nullable
- created_at
- updated_at

> This is better than keeping owner as a raw string only.

---

### D. Shared Infrastructure

#### `poles`
Purpose:
- shared physical pole master

Fields:
- id
- pole_code
- pole_tag
- region_id nullable
- province_id nullable
- city_id nullable
- barangay_id nullable
- latitude nullable
- longitude nullable
- owner_id nullable
- remarks nullable
- created_at
- updated_at

Important:
- dashboard pole list should show **pole owner**
- not all poles belong to Meralco

---

#### `projects`
Purpose:
- project grouping
- required by Telco 2
- optional for Telco 1 later if needed

Fields:
- id
- client_id
- project_name
- project_code
- status
- project_logo nullable
- date_start nullable
- due_date nullable
- date_finished nullable
- created_at
- updated_at

The current Telco 2 documentation treats `projects` as teardown contracts. :contentReference[oaicite:8]{index=8}

---

#### `nodes`
Purpose:
- **Telco 2 only**

Fields:
- id
- project_id
- node_id
- data_source nullable
- sites nullable
- region_id nullable
- province_id nullable
- city_id nullable
- barangay_id nullable
- team nullable
- status
- approved_by nullable
- date_start nullable
- due_date nullable
- date_finished nullable
- file nullable
- total_strand_length nullable
- expected_cable default 0
- actual_cable default 0
- extender default 0
- node_count default 0
- amplifier default 0
- tsc default 0
- progress_percentage default 0
- created_at
- updated_at

Rule:
- `node_id` is unique **per project**, not globally unique :contentReference[oaicite:9]{index=9}

---

#### `pole_spans`
Purpose:
- shared span master for both telcos

Fields:
- id
- client_id
- project_id nullable
- node_id nullable
- from_pole_id
- to_pole_id
- length_meters
- runs default 1
- expected_cable
- expected_node nullable
- expected_amplifier nullable
- expected_extender nullable
- expected_tsc nullable
- span_type
- status
- remarks nullable
- created_at
- updated_at

Span types:
- `telco1_cable_only`
- `telco2_cable_with_components`

Rules:
- teardown always happens on span
- prevent reverse duplicates unless intentionally directional
- `expected_cable = length_meters * runs` :contentReference[oaicite:10]{index=10} :contentReference[oaicite:11]{index=11}

---

### E. Telco 1 / Globe

#### `nap_boxes`
Purpose:
- Globe NAP box records

Fields:
- id
- client_id
- pole_id
- nap_box_code
- status
- active_count default 0
- inactive_count default 0
- free_count default 0
- last_updated_at nullable
- created_at
- updated_at

---

#### `nap_slots`
Purpose:
- Globe NAP slots

Fields:
- id
- nap_box_id
- slot_number
- slot_status
- linked_account_id nullable
- created_at
- updated_at

---

#### `client_accounts`
Purpose:
- Globe account lookup

Fields:
- id
- client_id
- account_number
- client_name nullable
- address nullable
- account_status
- pole_id nullable
- nap_box_id nullable
- nap_slot_id nullable
- created_at
- updated_at

---

#### `telco1_audits`
Purpose:
- Globe pole/NAP audits

Fields:
- id
- client_id
- pole_id
- nap_box_id nullable
- audit_status
- last_audited_at
- audited_by
- remarks nullable
- created_at
- updated_at

---

#### `telco1_teardown_logs`
Purpose:
- Globe cable-only teardown submissions

Fields:
- id
- client_id
- project_id nullable
- pole_span_id
- pole_id nullable
- account_id nullable
- nap_box_id nullable
- nap_slot_id nullable
- status
- teardown_reason
- did_collect_all_cable
- collected_cable nullable
- unrecovered_cable nullable
- unrecovered_reason nullable
- current_nap_status nullable
- new_nap_status nullable
- current_slot_status nullable
- new_slot_status nullable
- started_at nullable
- finished_at nullable
- submitted_by
- created_at
- updated_at

---

### F. Telco 2 / SkyCable

#### `telco2_teardown_logs`
Purpose:
- actual field teardown submissions for one selected span

Fields:
- id
- client_id
- project_id
- node_id
- pole_span_id
- team nullable
- status
- did_collect_all_cable
- collected_cable nullable
- unrecovered_cable nullable
- unrecovered_reason nullable
- did_collect_components
- expected_cable_snapshot nullable
- expected_node_snapshot nullable
- expected_amplifier_snapshot nullable
- expected_extender_snapshot nullable
- expected_tsc_snapshot nullable
- started_at nullable
- finished_at nullable
- submitted_by
- created_at
- updated_at

This matches the current design where a teardown log is the real field transaction for one selected span, with snapshot values preserved. :contentReference[oaicite:12]{index=12}

---

#### `telco2_component_recoveries`
Purpose:
- component recovery for Telco 2 only

Fields:
- id
- teardown_log_id
- collected_node default 0
- collected_amplifier default 0
- collected_extender default 0
- collected_tsc default 0
- remarks nullable
- created_at
- updated_at

The current app explicitly tracks collected node, amplifier, extender, and tsc values on teardown. :contentReference[oaicite:13]{index=13} :contentReference[oaicite:14]{index=14}

---

### G. Shared Evidence and Validation

#### `attachments`
Purpose:
- all images and supporting files

Fields:
- id
- client_id
- attachable_type
- attachable_id
- pole_id nullable
- photo_type
- file_path
- embedded_datetime nullable
- gps_latitude nullable
- gps_longitude nullable
- uploaded_by nullable
- created_at
- updated_at

Photo types:
- before
- after
- pole_tag
- gps_map
- missing_cable
- supporting

Why:
- the same pole can appear in multiple teardown operations, so images should belong to teardown activity, not directly to the pole master :contentReference[oaicite:15]{index=15}

---

#### `validations`
Purpose:
- validation workflow

Fields:
- id
- client_id
- validatable_type
- validatable_id
- validation_status
- validated_by nullable
- validated_at nullable
- remarks nullable
- rejected_reason nullable
- created_at
- updated_at

Statuses:
- submitted
- for_validation
- approved
- rejected
- needs_revision
- validated_complete

---

#### `evidence_previews`
Purpose:
- safe preview for pole owners only

Fields:
- id
- pole_id
- owner_id
- attached_telco
- project_name nullable
- node_id nullable
- nap_box_id nullable
- pole_tag
- embedded_datetime nullable
- province nullable
- city nullable
- barangay nullable
- gps_map_image nullable
- before_image nullable
- after_image nullable
- last_audit_date nullable
- validation_summary
- created_at
- updated_at

This is the safe bridge between telco workflows and Meralco / pole-owner viewing.

---

### H. Permits

#### `permits`
Purpose:
- permit tracking for ongoing Telco 2 projects

Fields:
- id
- client_id
- project_id
- node_id nullable
- permit_type
- permit_number nullable
- issuing_authority nullable
- submitted_at nullable
- approved_at nullable
- expiry_date nullable
- status
- remarks nullable
- created_at
- updated_at

Permit types:
- site_permit
- lgu_permit
- barangay_permit
- hoa_permit
- traffic_rerouting

These are straight from the scope’s permitting requirements. :contentReference[oaicite:16]{index=16}

---

#### `permit_attachments`
Purpose:
- files tied to permits

Fields:
- id
- permit_id
- file_path
- attachment_type
- uploaded_by nullable
- uploaded_at nullable
- created_at
- updated_at

---

### I. Warehouse / Delivery

#### `haul_batches`
Purpose:
- hauling batch from field to warehouse

Fields:
- id
- client_id
- project_id
- node_id nullable
- batch_code
- source_type
- source_reference_id
- picked_up_by nullable
- pickup_time nullable
- status
- created_at
- updated_at

---

#### `haul_batch_items`
Purpose:
- itemized expected/actual contents of a haul batch

Fields:
- id
- haul_batch_id
- item_type
- item_reference nullable
- expected_qty nullable
- actual_qty nullable
- unit nullable
- remarks nullable
- created_at
- updated_at

---

#### `warehouse_receipts`
Purpose:
- receiving record in staging or final warehouse

Fields:
- id
- haul_batch_id
- warehouse_name
- received_by nullable
- received_at nullable
- validation_status
- remarks nullable
- created_at
- updated_at

---

#### `warehouse_validations`
Purpose:
- compare expected vs received materials

Fields:
- id
- warehouse_receipt_id
- expected_cable nullable
- received_cable nullable
- expected_node nullable
- received_node nullable
- expected_amplifier nullable
- received_amplifier nullable
- expected_extender nullable
- received_extender nullable
- expected_tsc nullable
- received_tsc nullable
- discrepancy_notes nullable
- validated_by nullable
- validated_at nullable
- created_at
- updated_at

---

#### `delivery_transfers`
Purpose:
- transfer from staging warehouse to final warehouse

Fields:
- id
- warehouse_receipt_id
- from_location
- to_location
- transferred_by nullable
- transferred_at nullable
- received_by nullable
- received_at nullable
- status
- remarks nullable
- created_at
- updated_at

The scope explicitly requires hauling logs, sorting/segregation, transport, and staging warehouse handling before final delivery. :contentReference[oaicite:17]{index=17}

---

### J. Inventory / Acceptance

#### `node_inventory_summaries`
Purpose:
- per-node inventory summary for Telco 2

Fields:
- id
- node_id
- expected_cable nullable
- recovered_cable nullable
- unrecovered_cable nullable
- missing_cable nullable
- expected_active_devices nullable
- recovered_active_devices nullable
- missing_active_devices nullable
- expected_passive_devices nullable
- recovered_passive_devices nullable
- missing_passive_devices nullable
- actual_strand_length nullable
- expected_strand_length nullable
- updated_at nullable
- created_at
- updated_at

The scope requires per-node inventory logs for recovered, unrecovered, and missing materials, including actual and strand length. :contentReference[oaicite:18]{index=18}

---

#### `node_acceptance_documents`
Purpose:
- per-node acceptance checklist

Fields:
- id
- node_id
- document_type
- file_path nullable
- status
- uploaded_by nullable
- uploaded_at nullable
- reviewed_by nullable
- reviewed_at nullable
- remarks nullable
- created_at
- updated_at

Document types:
- inventory_report
- certificate_of_completion
- vicinity_map
- redlined_site_plan
- pole_photos_report
- rtd_file
- materials_return_slip
- geo_tagged_photos

These map directly to the scope’s required node acceptance documents. :contentReference[oaicite:19]{index=19} :contentReference[oaicite:20]{index=20}

---

## 3) Relationships
## These relationships must work

### Shared
- `Client hasMany Projects`
- `Client hasMany PoleSpans`
- `Client hasMany Telco1TeardownLogs`
- `Client hasMany Telco2TeardownLogs`

### Areas
- `Region hasMany Provinces`
- `Province hasMany Cities`
- `City hasMany Barangays`

### Owners / poles
- `Owner hasMany Poles`
- `Pole belongsTo Owner`
- `Pole hasMany PoleOwnerMaps`

### Poles / spans
- `Pole hasMany outgoingSpans via from_pole_id`
- `Pole hasMany incomingSpans via to_pole_id`
- `PoleSpan belongsTo fromPole`
- `PoleSpan belongsTo toPole`

### Projects / nodes
- `Project hasMany Nodes`
- `Node belongsTo Project`

### Telco 1
- `Pole hasMany NapBoxes`
- `NapBox belongsTo Pole`
- `NapBox hasMany NapSlots`
- `NapSlot belongsTo NapBox`
- `ClientAccount belongsTo Pole optional`
- `ClientAccount belongsTo NapBox optional`
- `ClientAccount belongsTo NapSlot optional`
- `Telco1Audit belongsTo Pole`
- `Telco1TeardownLog belongsTo PoleSpan`
- `Telco1TeardownLog morphMany Attachments`
- `Telco1TeardownLog morphOne Validation`

### Telco 2
- `Node hasMany PoleSpans`
- `Telco2TeardownLog belongsTo Project`
- `Telco2TeardownLog belongsTo Node`
- `Telco2TeardownLog belongsTo PoleSpan`
- `Telco2TeardownLog hasOne Telco2ComponentRecovery`
- `Telco2TeardownLog morphMany Attachments`
- `Telco2TeardownLog morphOne Validation`

### Permits / warehouse
- `Project hasMany Permits`
- `Node hasMany Permits optional`
- `Permit hasMany PermitAttachments`
- `HaulBatch hasMany HaulBatchItems`
- `HaulBatch hasOne WarehouseReceipt`
- `WarehouseReceipt hasOne WarehouseValidation`
- `WarehouseReceipt hasMany DeliveryTransfers`

### Validation-safe preview
- `Pole hasMany EvidencePreviews`
- `Owner hasMany EvidencePreviews`

---

## 4) API Groups
## Keep the API grouped like this

### Auth / core
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`

### Shared lookup
- `GET /api/clients`
- `GET /api/owners`
- `GET /api/areas/regions`
- `GET /api/areas/provinces`
- `GET /api/areas/cities`
- `GET /api/areas/barangays`
- `GET /api/poles`
- `GET /api/poles/{id}`
- `GET /api/poles/{id}/spans`

The current docs already recommend returning all connected spans when a pole is selected. :contentReference[oaicite:21]{index=21}

### Telco 1
- `GET /api/telco1/nap-boxes`
- `GET /api/telco1/nap-boxes/{id}`
- `GET /api/telco1/nap-slots`
- `GET /api/telco1/accounts/search`
- `GET /api/telco1/audits`
- `POST /api/telco1/audits`
- `GET /api/telco1/teardowns`
- `POST /api/telco1/teardowns`
- `GET /api/telco1/teardowns/{id}`

### Telco 2
- `GET /api/telco2/projects`
- `POST /api/telco2/projects`
- `GET /api/telco2/projects/{id}`
- `GET /api/telco2/nodes`
- `POST /api/telco2/nodes`
- `GET /api/telco2/spans`
- `POST /api/telco2/spans`
- `GET /api/telco2/teardowns`
- `POST /api/telco2/teardowns`
- `GET /api/telco2/teardowns/{id}`
- `POST /api/telco2/teardowns/{id}/components`

### Validation
- `GET /api/validations`
- `POST /api/validations/{id}/approve`
- `POST /api/validations/{id}/reject`

### Attachments
- `POST /api/attachments`
- `GET /api/attachments/{id}`

### Permits
- `GET /api/permits`
- `POST /api/permits`
- `GET /api/permits/{id}`
- `POST /api/permits/{id}/attachments`

### Warehouse
- `GET /api/haul-batches`
- `POST /api/haul-batches`
- `POST /api/warehouse-receipts`
- `POST /api/warehouse-validations`
- `POST /api/delivery-transfers`

### Pole-owner preview
- `GET /api/pole-owner/poles`
- `GET /api/pole-owner/poles/{id}/preview`
- `GET /api/pole-owner/validations`

---

## 5) Migration Order
## This is the order Claude Code should generate

1. `clients`
2. `client_configs`
3. `users`
4. `roles`
5. `user_roles`
6. `client_user`
7. `regions`
8. `provinces`
9. `cities`
10. `barangays`
11. `owners`
12. `poles`
13. `pole_owner_maps`
14. `projects`
15. `nodes`
16. `pole_spans`
17. `nap_boxes`
18. `nap_slots`
19. `client_accounts`
20. `telco1_audits`
21. `telco1_teardown_logs`
22. `telco2_teardown_logs`
23. `telco2_component_recoveries`
24. `attachments`
25. `validations`
26. `evidence_previews`
27. `permits`
28. `permit_attachments`
29. `haul_batches`
30. `haul_batch_items`
31. `warehouse_receipts`
32. `warehouse_validations`
33. `delivery_transfers`
34. `node_inventory_summaries`
35. `node_acceptance_documents`
36. `user_area_assignments`
37. `user_project_assignments`
38. `user_node_assignments`

---

## 6) Tables not to create yet
## Skip these for now to avoid waste

Do **not** create yet:
- `project_reports`
- `node_progress_snapshots`
- `component_inventory_logs`
- `activity_logs`
- `permit_requirements`
- `owner_access_rules`

Why:
- all of these can be derived later
- they are useful, but not required for the first working build
- they add overhead before the real workflows are stable

---

## 7) Must-have Constraints

### Unique constraints
- `clients.client_code`
- `roles.role_code`
- `owners.owner_code`
- `projects.project_code` per client if needed
- `nodes(project_id, node_id)` unique
- `nap_slots(nap_box_id, slot_number)` unique
- prevent reverse duplicate spans:
  - either with normalized `span_key`
  - or app-level validation before insert

### Foreign keys
- always use foreign keys where possible
- cascade delete only where safe
- prefer restrict deletes on core records like poles, spans, projects

### Indexes
- `poles.owner_id`
- `poles.province_id`
- `poles.city_id`
- `poles.barangay_id`
- `pole_spans.client_id`
- `pole_spans.project_id`
- `pole_spans.node_id`
- `pole_spans.from_pole_id`
- `pole_spans.to_pole_id`
- `pole_spans.status`
- `nap_boxes.pole_id`
- `nap_slots.nap_box_id`
- `client_accounts.account_number`
- `permits.project_id`
- `permits.node_id`
- `permits.status`
- `warehouse_receipts.haul_batch_id`
- `evidence_previews.owner_id`
- `evidence_previews.pole_id`

The current Telco 2 DB doc already recommends indexes on `nodes.project_id`, `pole_spans.node_id`, `pole_spans.from_pole_id`, `pole_spans.to_pole_id`, `teardown_logs.project_id`, `teardown_logs.node_id`, and `teardown_log_images.teardown_log_id/pole_id`. :contentReference[oaicite:22]{index=22}

---

## 8) Claude Code instruction

Tell Claude Code:

- use Laravel migrations
- create only the tables listed above
- do not invent extra summary tables
- do not merge Telco 1 and Telco 2 teardown logs
- use polymorphic `attachments`
- use polymorphic `validations`
- keep `pole_spans` shared
- keep `nodes` Telco 2 only
- keep `nap_boxes` and `nap_slots` Telco 1 only
- keep `evidence_previews` preview-safe only
- use enums or constrained strings for statuses
- generate Eloquent relationships after migrations
- generate API resources/controllers grouped by module
- generate form request validation rules
- generate seeders only for lookup tables, not fake business data yet

---

## 9) Final Definition

This is a lean, usable database design where:

- **Telco 1 / Globe** uses poles + spans + NAP + slots for cable-only teardown
- **Telco 2 / SkyCable** uses projects + nodes + poles + spans for cable and component teardown
- **Pole owners** only get a safe preview of validation evidence
- **Permits, warehouse, delivery, and acceptance docs** are included because the scope requires them
- **No dead tables** are added beyond what the workflows actually use