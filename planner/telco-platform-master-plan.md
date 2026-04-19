# Telco Platform Master Plan

## 1. Executive Summary

This platform will be built as a **shared Laravel API-first backend** with **client-scoped modules** for three client types:

* **Telco 1 / Globe**
* **Telco 2 / SkyCable**
* **Client 3 / Meralco and other pole owners**

The platform must support shared pole and area references while keeping each client’s operational workflow, permissions, and visible fields isolated.

The key design principle is:

* **Pole is the shared physical asset**
* **Span is the shared teardown unit**
* **NAP is Telco 1 specific**
* **Node is Telco 2 specific**
* **Validation is the shared output for pole owners or reference viewers**

This design allows all three workflows to stay related without forcing them into one incorrect data model.

---

## 2. Shared Business Rules

### Common reality across the platform

* telecom work happens on physical poles
* cable often exists between poles
* field teams need before/after image proof
* pole tag verification is required
* area and location hierarchy are important
* the system must support validation and restricted visibility

### Shared design principles

* use one backend platform
* isolate data by client and role
* share pole master records
* support span-based teardown for both Telco 1 and Telco 2
* allow different workflow depth per client
* expose limited validation views for pole owners or reference viewers

---

## 3. Client 1 — Telco 1 / Globe Full Rework

### Business Focus

Telco 1 is focused on:

* NAP-based subscriber operations
* active / inactive / free slot visibility
* disconnected subscriber cable teardown
* damaged or replaced cable teardown
* span grouping for cable distance and teardown coverage
* audit and validation workflows

### Important operational rule

Telco 1 uses:

* **Pole**
* **Span**
* **NAP Box**
* **NAP Slot**
* **Subscriber / Account context**

Telco 1 teardown is **span-based**, but it is **cable-only**.

It does **not** require component recovery like node, amplifier, extender, or tsc.

### Telco 1 core entities

* client
* project (optional if needed for grouping)
* pole
* pole span
* NAP box
* NAP slot
* subscriber account
* audit record
* teardown ticket
* validation record
* attachments

### Telco 1 workflow

#### A. NAP availability workflow

* select area or search address
* locate nearest pole / NAP box
* view active, inactive, and free slots
* install into free slot
* update slot to active

#### B. Cable teardown workflow

* select pole or account
* load connected spans
* choose target span for teardown
* capture before/after images
* capture pole tag
* capture GPS map image if required
* record cable teardown status
* update NAP and slot statuses when relevant
* submit for validation

#### C. Validation workflow

* review proof
* confirm date/time and location data
* confirm before/after state
* approve or reject

### Telco 1 recommended modules

* Area Management
* Pole Master View
* NAP Inventory
* NAP Slot Availability
* Span List per Pole
* Cable-only Teardown
* Telco 1 Validation Queue
* Dashboard Summary

### Telco 1 recommended statuses

#### Pole status

* pending
* in_progress
* completed
* not_audited
* audited

#### Span status

* pending
* in_progress
* completed
* blocked

#### NAP status

* available
* partially_used
* full
* faulty
* for_audit
* for_teardown

#### Slot status

* free
* active
* inactive
* disconnected
* for_teardown
* teardown_completed

#### Ticket status

* draft
* submitted
* for_validation
* approved
* rejected
* completed

### Telco 1 tools and apps

#### Backend

* Laravel
* Laravel Sanctum
* Laravel Policies / Gates
* MySQL or PostgreSQL
* Laravel Queues for uploads or processing

#### Frontend / Web

* React or Next.js
* Tailwind CSS
* Axios or TanStack Query
* shadcn/ui optional for reusable admin components

#### Mobile / Field

* React Native Expo or mobile-responsive web app
* device camera integration
* offline-ready forms later

#### Mapping / Geography

* PSA PSGC API
* GeoJSON boundary files
* Leaflet / React Leaflet
* optional Google Maps geocoding for address search

#### File / Media

* Laravel storage
* S3-compatible storage or local storage for development
* image compression / thumbnail generation

### Telco 1 planner

#### Phase 1

* build area hierarchy
* build pole master table
* build shared span table
* build NAP box and slot tables
* build client assignment and permissions

#### Phase 2

* build Telco 1 dashboard
* build pole search and span list
* build NAP availability module
* build account-linked lookup

#### Phase 3

* build cable-only teardown form
* build before/after upload flow
* build pole tag and GPS preview
* build validation queue

#### Phase 4

* build reports and audit summaries
* build Meralco-safe validation output for Telco 1 records

---

## 4. Client 2 — Telco 2 / SkyCable Full Rework

### Business Focus

Telco 2 is focused on:

* project-based teardown operations
* node-based grouping
* pole span teardown
* cable recovery
* collectable component recovery
* before/after pole proof
* pole tag verification
* validation and evidence tracking

### Important operational rule

Telco 2 uses:

* **Project**
* **Node**
* **Pole**
* **Pole Span**
* **Teardown Log**
* **Teardown Images**
* **Component Recovery**

Telco 2 teardown is **span-based** and includes:

* cable
* node
* amplifier
* extender
* tsc
* other future collectable components

### Telco 2 core entities

* client
* project
* node
* pole
* pole span
* span teardown log
* span teardown images
* span component recovery
* validation record
* attachments

### Telco 2 workflow

#### A. Project setup workflow

* create project
* create nodes inside project
* assign poles to node
* create pole spans
* store expected cable and expected components per span

#### B. Span teardown workflow

* select project
* select node
* select pole
* load connected spans
* choose span
* capture before/after at start pole
* capture pole tag at start pole
* capture before/after at destination pole
* capture pole tag at destination pole
* ask if all cable was collected
* if not, record unrecovered cable, reason, and evidence
* ask if all collectable components were collected
* record collected node, amplifier, extender, tsc
* save snapshots of expected values
* submit teardown log

#### C. Validation workflow

* review evidence for both poles
* verify cable and component submissions
* confirm completion or rejection
* expose safe validation summary for pole owner when needed

### Telco 2 recommended modules

* Project Management
* Node Management
* Pole Master View
* Span Management
* Span Teardown Logs
* Component Recovery Tracking
* Validation Queue
* Dashboard Summary

### Telco 2 recommended statuses

#### Project status

* planning
* active
* in_progress
* completed
* archived

#### Node status

* pending
* in_progress
* completed
* blocked

#### Pole status

* pending
* in_progress
* completed

#### Span status

* pending
* in_progress
* completed
* blocked

#### Teardown log status

* draft
* submitted
* for_validation
* approved
* rejected
* completed

### Telco 2 tools and apps

#### Backend

* Laravel
* Laravel Sanctum
* MySQL or PostgreSQL
* queue workers for file uploads and processing
* activity log package optional

#### Frontend / Web

* React or Next.js
* Tailwind CSS
* data table components
* charting optional for summary only

#### Mobile / Field

* React Native Expo or mobile responsive app
* fast pole selection flow
* image capture workflow
* offline sync later

#### Mapping / Geography

* PSA PSGC API
* GeoJSON files
* Leaflet / React Leaflet

#### File / Media

* structured upload storage by log
* image metadata handling
* image preview generation

### Telco 2 planner

#### Phase 1

* build projects table
* build nodes table
* connect nodes to poles
* build shared span table with node support
* build expected cable and component model

#### Phase 2

* build SkyCable dashboard
* build project and node summaries
* build pole to connected spans API
* build span management UI

#### Phase 3

* build span teardown logs
* build cable recovery flow
* build component recovery flow
* build teardown image uploads per pole and span

#### Phase 4

* build validation queue
* build unrecovered cable reports
* build component summaries
* build Meralco-safe validation output for Telco 2 records

---

## 5. Client 3 — Meralco and Other Pole Owners

### Business Focus

Client 3 is not a teardown operations client.

It is a **pole ownership / validation viewer**.

This client may include:

* Meralco
* Globe-owned poles
* PLDT-owned poles
* Converge-owned poles
* other future pole owners

### Important business rule

Not all poles belong to Meralco.

Each pole must support an owner or reference source such as:

* meralco
* globe
* pldt
* converge
* unknown
* other

### Pole owner purpose

Pole owners should be able to view:

* pole identity
* pole tag
* attached telco
* project reference
* node reference if available
* last audit date
* safe before/after validation images
* GPS map image
* area metadata

They should **not** see:

* internal ticket statuses
* internal remarks
* subscriber details
* slot-level customer information
* internal component accounting unless explicitly allowed

### Pole owner validation view fields

Safe preview fields:

* pole_id
* pole_tag
* owner_type
* attached_telco
* project_name
* node_id nullable
* nap_box_id nullable
* embedded_datetime
* province
* city
* barangay
* GPS map image
* before image
* after image
* last_audit_date
* validation_state summary only

### Pole owner tools and apps

#### Web portal

* React or Next.js
* Tailwind CSS
* image preview cards
* searchable pole list
* map with limited markers

#### Backend

* Laravel API
* scoped preview endpoints
* field-level transformers
* strict authorization middleware

#### Mapping

* Leaflet / React Leaflet
* GeoJSON boundaries

### Pole owner planner

#### Phase 1

* add pole owner type to poles
* define validation-safe output fields
* build attachment preview model

#### Phase 2

* build pole-owner dashboard
* build safe preview endpoints
* build searchable validation list

#### Phase 3

* build map view for owned poles only
* build image review modal
* build audit date and telco summary view

---

## 6. Unified Backend Architecture

### Final platform rule

The backend will use:

* **shared pole master**
* **shared span master**
* **client-specific operational modules**
* **shared validation output**

### Shared entities

* clients
* client_configs
* users
* roles
* permissions
* regions
* provinces
* cities
* barangays
* projects
* poles
* pole_spans
* attachments
* validations
* evidence_previews

### Client-specific entities

#### Telco 1 only

* nap_boxes
* nap_slots
* client_accounts
* telco1_teardown_logs
* telco1_audits

#### Telco 2 only

* nodes
* telco2_teardown_logs
* telco2_component_recoveries

#### Pole owner / validation only

* owner_access_rules
* pole_owner_views or policy-based views

---

## 7. Suggested Database Design

### Shared tables

* `clients`
* `client_configs`
* `users`
* `client_user`
* `roles`
* `permissions`
* `regions`
* `provinces`
* `cities`
* `barangays`
* `projects`
* `poles`
* `pole_spans`
* `attachments`
* `validations`
* `evidence_previews`
* `activity_logs`

### Telco 1 tables

* `nap_boxes`
* `nap_slots`
* `client_accounts`
* `telco1_audits`
* `telco1_teardown_logs`

### Telco 2 tables

* `nodes`
* `telco2_teardown_logs`
* `telco2_component_recoveries`

### Suggested key rules

#### `poles`

* shared physical poles
* includes area fields
* includes `owner_type`
* includes `pole_tag`
* includes lat/lng

#### `pole_spans`

* shared span master for both telcos
* `from_pole_id`
* `to_pole_id`
* `client_id`
* `project_id nullable`
* `node_id nullable`
* `length_meters`
* `runs`
* `expected_cable`
* `span_type`
* `status`

#### Span type values

* `telco1_cable_only`
* `telco2_cable_with_components`

#### `attachments`

* generic file store for images
* supports photo types:

  * before
  * after
  * pole_tag
  * missing_cable
  * gps_map
  * supporting

#### `evidence_previews`

* safe summary view for pole owners
* stores preview-safe values only

---

## 8. Suggested API Design

### Shared API groups

* `/api/auth/...`
* `/api/clients/...`
* `/api/areas/...`
* `/api/projects/...`
* `/api/poles/...`
* `/api/spans/...`
* `/api/attachments/...`
* `/api/validations/...`
* `/api/dashboard/...`

### Telco 1 API groups

* `/api/telco1/nap-boxes/...`
* `/api/telco1/nap-slots/...`
* `/api/telco1/accounts/...`
* `/api/telco1/audits/...`
* `/api/telco1/teardowns/...`

### Telco 2 API groups

* `/api/telco2/nodes/...`
* `/api/telco2/spans/...`
* `/api/telco2/teardowns/...`
* `/api/telco2/components/...`

### Pole owner / validation groups

* `/api/pole-owner/poles/...`
* `/api/pole-owner/validations/...`
* `/api/poles/{id}/attachment-preview`

---

## 9. Final Security Model

### Every request must be filtered by

* client assignment
* role
* area assignment
* module permission
* field permission
* pole owner visibility rules

### Example access

#### Globe user

* full Telco 1 operational access
* cannot see SkyCable internal data
* cannot see pole-owner private config

#### SkyCable user

* full Telco 2 operational access
* cannot see Globe internal data
* cannot see pole-owner private config

#### Meralco or other pole owner

* validation-only safe view
* can only see poles assigned to them by owner type or access rule
* no internal tickets
* no subscriber details

---

## 10. Final Planner Order

### Stage 1 — Shared foundation

* clients
* users and permissions
* area hierarchy
* pole master
* shared span master
* pole owner type

### Stage 2 — Telco 1 module

* NAP box
* NAP slot
* account lookup
* cable-only teardown logs
* Telco 1 dashboard
* Telco 1 validation flow

### Stage 3 — Telco 2 module

* projects
* nodes
* expected cable and component fields
* span teardown logs
* component recovery
* SkyCable dashboard
* Telco 2 validation flow

### Stage 4 — Pole owner validation module

* evidence previews
* pole owner access rules
* owner-safe preview dashboard
* image review views

### Stage 5 — Reporting and optimization

* audit summaries
* validation summaries
* analytics dashboards
* indexing
* offline support planning

---

## 11. Final Recommended Stack

### Backend

* Laravel 12 or current stable Laravel version
* Laravel Sanctum
* MySQL or PostgreSQL
* Laravel Queues
* Laravel Storage / S3-compatible storage
* Spatie Permission optional
* Spatie Activity Log optional

### Frontend Web

* Next.js or React
* Tailwind CSS
* TanStack Query or Axios
* table library for admin data
* modal/image preview components

### Mobile / Field App

* React Native Expo
* or responsive web if team prefers one codebase first
* camera integration
* image compression
* offline-first later

### Mapping / GIS

* PSA PSGC API
* GeoJSON boundaries
* Leaflet / React Leaflet
* optional geocoding provider

### Media / Validation

* image preview generation
* EXIF or embedded date/time handling
* GPS metadata capture

---

## 12. Final One-Line Definition

This platform is a **shared pole and span-based telecom teardown system** where:

* **Telco 1 / Globe** handles NAP and cable-only span teardown
* **Telco 2 / SkyCable** handles node-based span teardown with component recovery
* **Meralco and other pole owners** use a restricted validation-only view to confirm attachment removal without seeing internal telco workflow data
