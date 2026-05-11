# Prototype Domain ERD

Source: May 2026 prototype screenshots for dashboard, sales/quotes, jobs, procurement, fabrication, paint, assembly, dispatch, customer success, products, and customers.

Design notes:

- App-owned domain tables use UUID primary keys.
- Better Auth-owned user IDs remain string IDs in the existing `user` table.
- Quote and job line data intentionally stores commercial snapshots so old quotes/jobs do not change when the product catalog changes.
- Stage-specific screens are driven from `job_stages` rows rather than separate procurement/fabrication/paint/assembly/dispatch job tables.

```mermaid
erDiagram
  user {
    text id PK
    text name
    text email
  }

  customers {
    uuid id PK
    text account_name
    text status
    text primary_contact_name
    text primary_email
    text primary_phone
    text default_address_line1
    text default_city
    text default_region
    text default_country
    text warning_note
    timestamptz created_at
    timestamptz updated_at
    timestamptz archived_at
  }

  customer_contacts {
    uuid id PK
    uuid customer_id FK
    text name
    text email
    text phone
    text role
    boolean is_primary
    timestamptz created_at
    timestamptz updated_at
  }

  customer_addresses {
    uuid id PK
    uuid customer_id FK
    text label
    text line1
    text line2
    text city
    text region
    text postal_code
    text country
    boolean is_default
    timestamptz created_at
    timestamptz updated_at
  }

  product_categories {
    uuid id PK
    text name
    text slug
    timestamptz created_at
    timestamptz updated_at
  }

  products {
    uuid id PK
    uuid category_id FK
    text product_code
    text name
    text description
    integer base_price_cents
    text currency_code
    boolean is_base_model
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
    timestamptz archived_at
  }

  product_options {
    uuid id PK
    uuid product_id FK
    text option_code
    text name
    integer price_delta_cents
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
    timestamptz archived_at
  }

  parts {
    uuid id PK
    text part_number
    text name
    text category
    text unit
    integer estimated_unit_cost_cents
    text currency_code
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
  }

  product_bom_items {
    uuid id PK
    uuid product_id FK
    uuid product_option_id FK
    uuid part_id FK
    numeric quantity
    text unit
    text notes
    timestamptz created_at
    timestamptz updated_at
  }

  quotes {
    uuid id PK
    uuid customer_id FK
    uuid contact_id FK
    text quote_number
    text status
    date quote_date
    date valid_until
    integer subtotal_cents
    integer discount_cents
    integer tax_cents
    integer total_cents
    text currency_code
    text notes
    text terms
    text created_by_user_id FK
    timestamptz converted_at
    timestamptz created_at
    timestamptz updated_at
  }

  quote_lines {
    uuid id PK
    uuid quote_id FK
    uuid product_id FK
    text product_name_snapshot
    text product_code_snapshot
    integer quantity
    integer unit_price_cents
    integer line_total_cents
    integer sort_order
    timestamptz created_at
    timestamptz updated_at
  }

  quote_line_options {
    uuid id PK
    uuid quote_line_id FK
    uuid product_option_id FK
    text option_name_snapshot
    integer price_delta_cents
    timestamptz created_at
    timestamptz updated_at
  }

  jobs {
    uuid id PK
    uuid customer_id FK
    uuid quote_id FK
    uuid quote_line_id FK
    uuid product_id FK
    text job_number
    text status
    text service_status
    text product_name_snapshot
    text product_code_snapshot
    integer value_cents
    text currency_code
    date requested_delivery_date
    date scheduled_delivery_date
    date delivered_at
    text created_by_user_id FK
    timestamptz created_at
    timestamptz updated_at
    timestamptz cancelled_at
  }

  job_options {
    uuid id PK
    uuid job_id FK
    uuid product_option_id FK
    text option_name_snapshot
    integer price_delta_cents
    timestamptz created_at
    timestamptz updated_at
  }

  production_stages {
    uuid id PK
    text stage_key
    text name
    integer sort_order
    boolean is_active
  }

  job_stages {
    uuid id PK
    uuid job_id FK
    uuid production_stage_id FK
    text status
    date due_date
    timestamptz started_at
    timestamptz completed_at
    text assigned_to_user_id FK
    timestamptz created_at
    timestamptz updated_at
  }

  job_stage_status_events {
    uuid id PK
    uuid job_stage_id FK
    text from_status
    text to_status
    text changed_by_user_id FK
    text note
    timestamptz created_at
  }

  procurement_orders {
    uuid id PK
    uuid job_id FK
    text order_number
    text status
    date needed_by
    text created_by_user_id FK
    timestamptz created_at
    timestamptz updated_at
  }

  procurement_order_items {
    uuid id PK
    uuid procurement_order_id FK
    uuid part_id FK
    text part_name_snapshot
    text part_number_snapshot
    numeric quantity
    text unit
    integer estimated_unit_cost_cents
    timestamptz created_at
    timestamptz updated_at
  }

  service_cases {
    uuid id PK
    uuid job_id FK
    uuid customer_id FK
    text case_number
    text type
    text status
    text summary
    text description
    text opened_by_user_id FK
    text assigned_to_user_id FK
    timestamptz opened_at
    timestamptz closed_at
    timestamptz created_at
    timestamptz updated_at
  }

  service_tasks {
    uuid id PK
    uuid service_case_id FK
    uuid job_id FK
    uuid customer_id FK
    uuid production_stage_id FK
    text title
    text description
    text status
    text assigned_to_user_id FK
    date due_date
    timestamptz created_at
    timestamptz updated_at
    timestamptz completed_at
  }

  job_notes {
    uuid id PK
    uuid job_id FK
    text author_user_id FK
    text body
    timestamptz created_at
    timestamptz updated_at
  }

  activity_events {
    uuid id PK
    uuid customer_id FK
    uuid quote_id FK
    uuid job_id FK
    uuid service_case_id FK
    text actor_user_id FK
    text event_type
    jsonb payload
    timestamptz created_at
  }

  file_assets {
    uuid id PK
    uuid customer_id FK
    uuid quote_id FK
    uuid job_id FK
    uuid service_case_id FK
    text uploaded_by_user_id FK
    text file_name
    text mime_type
    integer size_bytes
    text storage_key
    text document_category
    text production_stage_key
    timestamptz created_at
  }

  customers ||--o{ customer_contacts : has
  customers ||--o{ customer_addresses : has
  customers ||--o{ quotes : receives
  customers ||--o{ jobs : owns
  customers ||--o{ service_cases : raises
  customers ||--o{ activity_events : appears_in
  customers ||--o{ file_assets : attaches

  product_categories ||--o{ products : groups
  products ||--o{ product_options : offers
  products ||--o{ product_bom_items : requires
  product_options ||--o{ product_bom_items : adds
  parts ||--o{ product_bom_items : used_by

  quotes ||--o{ quote_lines : contains
  quote_lines ||--o{ quote_line_options : selects
  products ||--o{ quote_lines : quoted_as
  product_options ||--o{ quote_line_options : quoted_as
  customer_contacts ||--o{ quotes : requested_by
  user ||--o{ quotes : creates

  quotes ||--o{ jobs : converts_to
  quote_lines ||--o{ jobs : becomes
  products ||--o{ jobs : built_as
  jobs ||--o{ job_options : includes
  product_options ||--o{ job_options : built_as
  user ||--o{ jobs : creates

  production_stages ||--o{ job_stages : defines
  jobs ||--o{ job_stages : tracks
  job_stages ||--o{ job_stage_status_events : records
  user ||--o{ job_stages : assigned
  user ||--o{ job_stage_status_events : changes

  jobs ||--o{ procurement_orders : needs
  procurement_orders ||--o{ procurement_order_items : contains
  parts ||--o{ procurement_order_items : ordered_as
  user ||--o{ procurement_orders : creates

  jobs ||--o{ service_cases : has
  service_cases ||--o{ service_tasks : breaks_into
  jobs ||--o{ service_tasks : produces
  production_stages ||--o{ service_tasks : routed_to
  user ||--o{ service_cases : assigned
  user ||--o{ service_tasks : assigned

  jobs ||--o{ job_notes : has
  user ||--o{ job_notes : writes
  quotes ||--o{ activity_events : logs
  jobs ||--o{ activity_events : logs
  service_cases ||--o{ activity_events : logs
  user ||--o{ activity_events : performs

  quotes ||--o{ file_assets : files
  jobs ||--o{ file_assets : files
  service_cases ||--o{ file_assets : files
  user ||--o{ file_assets : uploads
```
