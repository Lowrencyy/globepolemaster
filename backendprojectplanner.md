# Backend Project Plan

## Project Overview

This backend will be built as a **Laravel API-first multi-client platform** for:

* pole reference management
* NAP visibility and attachment monitoring
* pole audit workflows
* teardown validation workflows
* evidence and image review
* area-based access control
* client-scoped data isolation

The system should support multiple clients in one secure platform, while keeping each client limited to only the data and modules assigned to them.

Initial implementation priority is **Telco 1**, but the backend must be structured so it can also support:

* **Telco 2**
* **Meralco reference and pole-attachment visibility**

The uploaded scope supports this operations-first approach because it is organized around area/site activity, pole work, extraction/recovery, geo-tagged photographic proof, RTD-related documents, and project status reporting. fileciteturn29file2L1-L40 fileciteturn29file0L1-L34

---

## Core Backend Direction

### Recommended Architecture

* **Laravel** as the core backend
* **API-first** implementation
* one shared API for:

  * web dashboard
  * mobile app
  * audit workflows
  * teardown workflows
  * image/evidence review

### Why API-first fits this project

* one source of truth for poles, NAP boxes, audits, and evidence
* web and mobile can use the same backend
* security rules can be enforced from the backend
* easier to support multiple clients with different scopes
* easier to expand later without rebuilding the platform

---

## Business Model

This should be built as **one shared platform** with **client-scoped visibility**, not as separate disconnected systems.

### Example clients

* Globe
* SkyCable
* Meralco

### Shared platform elements

These are common across clients:

* area hierarchy
* pole master records
* location references
* NAP references
* audits
* attachments / images
* validation summaries
* dashboards

### Client-specific differences

Each client may differ in:

* workflow scope
* required images
* collectible components
* allowed modules
* allowed API access
* allowed record fields
* visible summary data

---

## Access and Security Model

The system must enforce **client-scoped access** and **field-level visibility**.

Each user should only access:

* assigned client
* assigned areas
* assigned modules
* allowed actions
* allowed visible fields

### Example

A user assigned to **Globe** should only see:

* Globe operational data
* Globe audits
* Globe teardown tickets
* Globe validations
* Globe NAP operational records

They should not see:

* SkyCable internal records
* Meralco internal records
* data outside their allowed areas

---

## Meralco Special Visibility Rule

Meralco should have a **limited pole attachment view**, not a full telco operations view.

### Meralco can only preview the following

* **Project name**
* **Node ID**
* **NAP Box ID**
* **Attached telco**
* **Embedded date and time**
* **Province**
* **City / Municipality**
* **Barangay**
* **Pole Tag**
* **GPS map picture of the area**
* **Before image of the pole**
* **After image of the pole**
* **Last audit date**

### Meralco should not see

* ticket status
* ticket remarks
* ticket approval state
* validator comments
* subscriber account details
* NAP slot customer details
* internal telco workflow data
* telco-only teardown details

### Important rule

Meralco access is **preview-only** for pole ownership / attachment review.

This matches the uploaded scope’s emphasis on pole-level proof and documentation, including:

* pre- and post-extraction geo-tagged photographs
* clear picture per pole with coordinates and pole number
* Meralco or Electric Cooperative RTD documents
* vicinity map and pole photographs fileciteturn29file0L35-L55 fileciteturn29file3L1-L22

---

## Client Configuration

The backend should support **manual client setup**.

### Client setup fields

* Client Name
* Client Code
* Active / Inactive
* Scope Type
* Allowed Modules
* Allowed API Scopes
* Allowed Record Fields
* Required Evidence Type
* Area Coverage
* Workflow Type

### Example configuration flags

* `requires_before_after`
* `requires_pole_tag_photo`
* `supports_nap_module`
* `supports_teardown_module`
* `supports_equipment_teardown`
* `supports_subscriber_cable_only`
* `supports_attachment_preview`
* `can_view_ticket_status`
* `can_view_internal_remarks`
* `can_view_subscriber_data`
* `can_view_project_node_summary`

This allows the frontend to stay dynamic and the backend to stay strict.

---

## Area and Mapping Support

The backend should support hierarchical locations:

* Region
* Province
* City / Municipality
* Barangay

### Mapping stack

* PSA PSGC API
* GeoJSON boundary files
* Leaflet on frontend

### Backend responsibility

The backend should provide:

* area lookup endpoints
* area-linked pole records
* client-scoped filtering by location
* metadata for GPS and map-image review
* references for map boundaries if needed

### Important design rule

* **GeoJSON** should be used for area boundaries
* **database records** should store actual pole, NAP, and audit metadata

---

## Core Data Layers

The backend should separate data into these layers.

### 1. Pole Master Layer

Shared pole reference record:

* pole ID
* pole name / pole number
* latitude
* longitude
* region
* province
* city
* barangay
* pole tag
* reference owner/source

### 2. Client Pole Layer

Client-specific operational data tied to a shared pole:

* client ID
* pole ID
* project name
* node ID
* attached telco name
* last audit date
* audit status
* operational summary
* allowed preview fields

### 3. NAP Layer

NAP data linked to a pole:

* NAP Box ID
* pole ID
* client ID
* NAP status
* summary counts
* last updated

### 4. Evidence Layer

Image and proof records:

* before pole image
* after pole image
* embedded date/time
* GPS map image
* project name
* node ID
* area metadata

### 5. Internal Ticket Layer

Restricted client-only workflow data:

* teardown ticket status
* internal remarks
* validation notes
* account-linked data
* slot-linked operational details

This layer must **not** be exposed to Meralco preview users.

---

## Core Backend Modules

### 1. Client Management

Purpose:

* create clients
* define per-client scope
* define allowed fields and modules
* isolate records by client

### 2. User and Access Management

Purpose:

* assign users to clients
* assign roles
* assign area access
* enforce field-level and module-level permissions

### 3. Area Management

Purpose:

* manage region/province/city/barangay hierarchy
* support filtering and map views
* support area-based security

### 4. Pole Master Management

Purpose:

* store shared pole references
* store coordinates and area metadata
* support cross-client pole lookup

### 5. Client Pole Operational Module

Purpose:

* store client-specific pole data
* store project name and node ID
* store attached telco summary
* store last audit date
* support restricted preview output

### 6. NAP Management

Purpose:

* link NAP boxes to poles
* support telco operational visibility
* support limited Meralco preview of NAP Box ID only

### 7. Audit Module

Purpose:

* create and update pole audits
* store audit date
* store area metadata
* support client-scoped operational summaries

### 8. Evidence / Attachment Module

Purpose:

* store before images
* store after images
* store GPS map images
* store embedded date/time metadata
* support preview-ready image responses

### 9. Internal Ticket Module

Purpose:

* manage teardown and validation workflows
* remain restricted to the owning telco/client
* not exposed to Meralco preview users

### 10. Dashboard Summary Module

Purpose:

* provide client-scoped dashboard counts
* provide pole and NAP summaries
* provide restricted preview datasets where needed

---

## Suggested Database Structure

### Core security tables

* `clients`
* `users`
* `client_user`
* `roles`
* `permissions`
* `client_configs`
* `client_modules`
* `client_field_permissions`
* `client_scopes`

### Area tables

* `regions`
* `provinces`
* `cities`
* `barangays`

### Pole tables

* `poles`
* `pole_references`
* `pole_client_data`

### NAP tables

* `nap_boxes`
* `nap_slots`

### Audit and evidence tables

* `audits`
* `attachments`
* `evidence_previews`
* `activity_logs`

### Internal restricted workflow tables

* `client_accounts`
* `teardown_tickets`
* `validations`
* `ticket_remarks`

### Optional future tables

* `equipment_records`
* `inventory_logs`
* `recovery_logs`
* `billing_readiness`

---

## Recommended Table Responsibilities

### `poles`

Shared physical pole master:

* pole ID
* pole name
* pole tag
* lat/lng
* area links
* owner/reference source

### `pole_client_data`

Client-specific operational summary:

* pole ID
* client ID
* project name
* node ID
* attached telco
* audit status
* last audit date
* summary visibility flags

### `nap_boxes`

NAP record linked to pole:

* NAP Box ID
* pole ID
* client ID
* status
* last updated

### `attachments`

Stores original images and metadata:

* attachment type
* client ID
* pole ID
* image path
* embedded date/time
* geo metadata

### `evidence_previews`

Stores or materializes safe preview data for restricted viewers such as Meralco:

* pole ID
* client ID
* project name
* node ID
* NAP Box ID
* attached telco
* preview before image
* preview after image
* GPS map image
* province
* city
* barangay
* pole tag
* last audit date

### `teardown_tickets`

Restricted client workflow only:

* ticket status
* internal workflow data
* internal notes
* not visible to Meralco preview users

---

## API Design Direction

The backend should expose REST API endpoints.

### Main API groups

* authentication
* clients
* users
* permissions
* areas
* poles
* pole client data
* NAP boxes
* audits
* attachments
* evidence previews
* dashboard summaries
* reports

### Restricted internal groups

* teardown tickets
* validations
* internal remarks
* subscriber-linked records

### Example endpoint groups

* `/api/auth/...`
* `/api/clients/...`
* `/api/areas/...`
* `/api/poles/...`
* `/api/poles/{id}/client-data`
* `/api/nap-boxes/...`
* `/api/audits/...`
* `/api/evidence-previews/...`
* `/api/dashboard/...`

### Important preview endpoint idea

For Meralco-style limited visibility, use a dedicated endpoint like:

* `/api/poles/{id}/attachment-preview`

This endpoint should only return:

* project name
* node ID
* NAP Box ID
* telco name
* embedded date/time
* province
* city
* barangay
* pole tag
* GPS map image
* before image
* after image
* last audit date

It should **not** return ticket state or internal telco workflow fields.

---

## Auth and Authorization

Recommended Laravel security stack:

* Laravel Sanctum or Passport
* middleware for authenticated routes
* policies / gates for record-level authorization
* client-scoping middleware
* area-based filtering middleware
* field-visibility transformer layer

### Minimum authorization rules

A user can only access records if:

* record belongs to an allowed client
* record belongs to an allowed area
* module is enabled for that client
* user has permission for the action
* requested fields are allowed for that client role

---

## Telco 1 Backend Priority

The first full backend implementation should focus on **Telco 1**.

### Telco 1 main needs

* pole master records
* client-scoped audit workflow
* NAP Box linkage
* evidence handling
* restricted preview-ready outputs
* dashboard summary endpoints

### Telco 1 internal ticket workflow

Keep these fields internal to Telco 1 users only:

* ticket status
* internal remarks
* validation notes
* slot-linked subscriber details
* account-linked workflow data

---

## Evidence and Documentation Support

The uploaded scope requires pole-related documentation such as:

* inventory logs per node
* pole photos report
* RTD file
* pre- and post-extraction geo-tagged photographs
* coordinates and pole number
* vicinity map and related proof documents fileciteturn29file1L20-L37 fileciteturn29file0L35-L55

The backend should therefore support:

* structured photo storage
* metadata extraction or storage for embedded date/time
* area-linked evidence
* GPS map image handling
* preview-safe outputs for limited viewers

---

## Suggested Build Phases

### Phase 1

* client management
* roles and permissions
* area hierarchy
* poles master table
* pole client data table
* client field visibility rules

### Phase 2

* NAP box management
* audit records
* attachment storage
* preview-safe evidence responses
* dashboard summary endpoints

### Phase 3

* internal ticket workflows
* validations
* activity logs
* restricted module routing

### Phase 4

* advanced filters
* client-specific workflow configuration
* Telco 2 expansion
* Meralco preview dashboards

---

## Final Definition

This backend project is a **multi-client Laravel API platform** for:

* shared pole reference records
* client-scoped operational summaries
* NAP linkage and visibility
* pole audit workflows
* image and evidence preview
* restricted internal ticket workflows
* area-based access and permissions

It should start with **Telco 1**, while also supporting a **limited Meralco pole attachment preview** that only shows:

* project name
* node ID
* NAP Box ID
* attached telco
* embedded date/time
* province
* city
* barangay
* pole tag
* GPS map picture
* before image
* after image
* last audit date

and explicitly hides:

* ticket statuses
* internal remarks
* subscriber records
* telco-only workflow data
