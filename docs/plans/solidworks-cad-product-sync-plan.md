# SolidWorks CAD to Product Sync Plan

Status: implementation plan.

This plan describes how Jedidah Ops should connect SolidWorks-derived manufacturing files to the existing Product, Assembly, Part, Quote, and Job model.

## Goal

Give operators a reliable way to download the exact manufacturing export files needed for a Job, while keeping SolidWorks as the CAD source of truth and Jedidah Ops as the business/catalogue source of truth.

The core requirement is not just "import a SolidWorks export". The real requirement is:

1. Designers create or revise Product and Part drawings in SolidWorks.
2. SolidWorks exports and gathers the required department files: SolidWorks assemblies, SolidWorks parts, SolidWorks drawings, and CNC DXF files.
3. Jedidah Ops maps each exported file to the correct Product, Assembly, or Part.
4. Product editors review changes before catalogue data is updated.
5. Jobs download the exact released file versions tied to that Job's CFO, not whatever the latest CAD export happens to be today.

## Current Domain Fit

The current app model is already a good fit for CAD-derived BOMs:

- SolidWorks top-level assembly maps to Product.
- SolidWorks sub-assembly maps to Product Assembly.
- SolidWorks part maps to Part.
- Exported manufacturing file maps to a CAD Export linked to a Product, Assembly, or Part.

Do not introduce a parallel CAD-only Product model. Extend the current catalogue with CAD provenance and export metadata.

## Plan

### Step 1: Standardize SolidWorks identity fields

Mapping must be driven by SolidWorks metadata, not filenames.

Add these custom properties to SolidWorks files:

```text
JED_PRODUCT_MODEL_CODE  -> products.modelCode
JED_ASSEMBLY_CODE       -> stable assembly code
JED_PART_CODE           -> parts.code
```

Rules:

- `JED_PART_CODE` lives on each `.SLDPRT` file.
- `JED_PRODUCT_MODEL_CODE` lives on the top-level `.SLDASM` file for a sellable Product.
- `JED_ASSEMBLY_CODE` lives on sub-assembly `.SLDASM` files.
- If one SolidWorks file has multiple configurations that represent different business Parts, `JED_PART_CODE` must be configuration-specific and the manifest must include the configuration name.
- `parts.drawingCode` should be treated as a legacy/manual linking field. The CAD sync model supersedes it with explicit Part codes, CAD document metadata, export records, storage keys, and file hashes.

Design workflow:

- Use SolidWorks Property Tab Builder to give designers shared Part and Assembly property tabs.
- Keep the first workflow file-based: designers export a bundle from SolidWorks, and Jedidah Ops imports that bundle.

### Step 2: Export a CAD bundle from SolidWorks

The SolidWorks-side export should produce a bundle, not only a JSON file.

```text
cad-export-2026-05-29.zip
  manifest.json
  files/
    TRAILER-750.SLDASM
    CHASSIS.SLDASM
    P-1001.SLDPRT
    P-1001.SLDDRW
    P-1001.dxf
```

The manifest is the index. The `files/` directory contains the actual manufacturing artifacts that Jedidah Ops can store or proxy.

The first bundle can be generated manually or by a simple SolidWorks macro/add-in. Do not make SolidWorks PDM a dependency for the first implementation.

The active v1 macro package lives at `pkg/solidworks/macro`. It runs from the active top-level Product assembly, requires the `JED_PRODUCT_MODEL_CODE`, `JED_ASSEMBLY_CODE`, and `JED_PART_CODE` custom-property convention, exports DXFs only for coded referenced Parts, and writes the durable Product -> Assembly -> Part manifest shape. Product and Assembly `exports` arrays are present but empty in v1 so later file support can extend the manifest instead of changing its structure. The macro does not gather drawings, source Part files, existing DXFs, or Pack and Go archives. The older assembly-oriented starter macro next to this plan remains planning reference material, not the v1 implementation package.

### Step 2a: Required department files

The first active bundle should support the files the departments actually requested:

| File type | Meaning | Departments |
| --- | --- | --- |
| `.SLDASM` | SolidWorks assembly document | Design, Supply, Fabrication |
| `.SLDPRT` | SolidWorks part document | Design, Supply, Fabrication |
| `.SLDDRW` | SolidWorks drawing document | Supply, Fabrication |
| `.DXF` | CNC part format, commonly used for flat patterns/cutting | CNC |

Note: `.SLDDRW` is a SolidWorks drawing document. It is not the same thing as a `.DWG` file, although SolidWorks drawings can often be exported to DWG/DXF if needed later.

The data model and manifest should still support any number of export files per entity:

- A Part may have its `.SLDPRT`, `.SLDDRW`, and `.DXF`.
- An Assembly may have its `.SLDASM` and `.SLDDRW`.
- A Product may have its top-level `.SLDASM` and drawing pack.

Do not hard-code one file per Part. Store `exportFormat` and `exportPurpose` as data.

### Step 2b: Import and run the v1 macro

The active v1 macro is stored as a reviewable `.bas` text file, not a binary SolidWorks `.swp` macro.

Import it into SolidWorks:

1. Open SolidWorks.
2. Go to `Tools > Macro > New`.
3. Save a new macro file, for example `JedidiahCadExport.swp`.
4. The VBA editor opens.
5. In the VBA editor, right-click the macro project and choose `Import File`.
6. Select `pkg/solidworks/macro/macro/JedidiahPartDxfExport.bas`.
7. Save the macro project.

Prepare the SolidWorks files:

1. Open the top-level Product assembly.
2. Set `JED_PRODUCT_MODEL_CODE` on the top-level `.SLDASM`.
3. Set `JED_ASSEMBLY_CODE` on sub-assembly `.SLDASM` files that should map to Product Assemblies.
4. Set `JED_PART_CODE` on each `.SLDPRT` that should map to a Jedidah Ops Part.

The macro attempts to create one `.dxf` for each coded sheet-metal Part referenced under a coded Product Assembly. If a Part is not sheet metal, or the export settings need manual input, no DXF may be created for that Part.

Run it:

1. With the top-level Product assembly open, go to `Tools > Macro > Run`.
2. Select the saved macro.
3. Choose an output folder when prompted.
4. The macro creates a folder like:

```text
cad-export-20260601-143000/
  manifest.json
  files/
    P-1001.dxf
    P-1002__LH.dxf
```

Current macro behavior and limitations:

- It runs from the active top-level Product assembly.
- It requires `JED_PRODUCT_MODEL_CODE` on the Product assembly.
- It uses `JED_ASSEMBLY_CODE` to group Parts under Product Assemblies.
- It exports `.DXF` files only for referenced Parts with `JED_PART_CODE`.
- It activates each referenced Part configuration before generating a DXF and suffixes export filenames with the configuration name.
- It writes Product and Assembly `exports` arrays in the manifest, but leaves them empty in v1.
- It does not copy `.SLDASM`, `.SLDPRT`, `.SLDDRW`, existing `.DXF`, or Pack and Go archive files into the bundle.
- It uses SHA-256 hashes as the file-change signal.
- It does not create `.SLDDRW` drawing documents.
- It should be tested against real Jedidiah SolidWorks assemblies before the app import contract is finalized.

### Step 3: Define the manifest contract

The manifest must include the business identifiers needed for deterministic matching.

Example:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-05-29T10:00:00.000Z",
  "sourceSystem": "solidworks",
  "product": {
    "modelCode": "TRAILER-750",
    "name": "750kg Trailer"
  },
  "cadSource": {
    "topLevelFileName": "TRAILER-750.SLDASM",
    "topLevelFilePath": "\\\\design-share\\Products\\TRAILER-750\\TRAILER-750.SLDASM",
    "configuration": "Default",
    "contentHash": "sha256:..."
  },
  "assemblies": [
    {
      "code": "CHASSIS",
      "name": "Chassis",
      "sourceFileName": "CHASSIS.SLDASM",
      "contentHash": "sha256:...",
      "parts": [
        {
          "partCode": "P-1001",
          "name": "Side Rail",
          "quantity": 2,
          "sourceFileName": "P-1001.SLDPRT",
          "sourceHash": "sha256:...",
          "configuration": "Default",
          "exports": [
            {
              "fileName": "P-1001.dxf",
              "format": "dxf",
              "purpose": "cnc-part",
              "hash": "sha256:..."
            },
            {
              "fileName": "P-1001.SLDDRW",
              "format": "slddrw",
              "purpose": "solidworks-drawing",
              "hash": "sha256:..."
            },
            {
              "fileName": "P-1001.SLDPRT",
              "format": "sldprt",
              "purpose": "solidworks-part",
              "hash": "sha256:..."
            }
          ]
        }
      ]
    }
  ]
}
```

Minimum required fields:

- Product: `modelCode`.
- Assembly: `code`, `name`.
- Part: `partCode`, `quantity`.
- Export: `fileName`, `format`, `purpose`, `hash`.
- Source metadata: source file name, configuration, and source file hash when available.

Do not require `drawingCode` in new CAD manifests. If historical data already has `parts.drawingCode`, the preview can show it as context during migration, but it should not be the primary matching key.

### Step 4: Build preview-only manifest import

First implementation should preview the import. It should not mutate Products, Assemblies, Parts, or CAD export records yet.

Suggested repo shape:

```text
pkg/schema/src/cad/cad-manifest.ts
pkg/core/src/cad/cad-reconciliation-service.ts
pkg/api/src/routes/cad/cad.router.ts
pkg/api/src/routes/cad/cad.router.test.ts
pkg/web/src/pages/products/ProductCadImportPage.tsx
pkg/web/src/pages/products/components/CadImportPreview.tsx
```

Preview behavior:

1. User uploads a CAD export bundle or manifest JSON.
2. Web parses the manifest.
3. API validates the manifest contract.
4. Core compares manifest rows to existing Products, Assemblies, and Parts.
5. UI shows a reconciliation preview.

Preview statuses:

- `matched`: manifest row maps cleanly to an existing app record.
- `new`: manifest row does not exist in the app yet.
- `changed`: existing app record differs from the manifest.
- `unchanged`: existing app record matches the manifest.
- `conflict`: the app cannot safely choose one record.
- `missing_export`: manifest references a file that is not present in the bundle.

Conflicts must block any future apply action.

### Step 5: Add durable CAD export storage

The manufacturing export file bytes should not live in Postgres.

Use app-owned artifact storage for released manufacturing exports. Postgres stores only metadata and storage keys.

Recommended durable model:

- SolidWorks files remain the design/source record.
- Jedidah Ops stores a copy of released manufacturing exports for job execution.
- Job downloads do not depend on a designer workstation path or file share.

Likely additive tables:

```text
cad_sync_runs
  id
  source_system
  exported_at
  imported_at
  status
  manifest_hash
  summary

cad_documents
  id
  source_system
  external_file_id
  file_name
  file_path
  document_type
  configuration
  content_hash

cad_exports
  id
  cad_document_id
  sync_run_id
  entity_type
  entity_id
  export_file_name
  export_format
  export_purpose
  export_hash
  storage_key
  status

cad_entity_links
  id
  cad_document_id
  entity_type
  entity_id
  link_role
```

The first write implementation should store CAD exports with `status = imported` or `status = released`. The exact status names can be finalized when the approval workflow is built.

### Step 6: Apply reviewed catalogue changes

After preview has been validated with real exports, add an apply flow.

Apply behavior:

1. Import or update CAD document metadata.
2. Upload export files to artifact storage.
3. Create or update `cad_exports`.
4. Link Part-level exports to existing Parts by `partCode`.
5. Link Assembly-level exports to Product Assemblies by `JED_ASSEMBLY_CODE`.
6. Link Product-level exports to Products by `JED_PRODUCT_MODEL_CODE`.
7. Report any Product/Assembly/Part changes that need user approval.
8. Apply Product Assembly and Part quantity changes only after explicit review.

Do not silently create or rewrite catalogue BOMs from CAD without user approval.

### Step 7: Snapshot CAD exports onto Jobs

The Job page download requirement means Jobs need a stable released file set.

When a Job is created, released, or prepared for production:

1. Load the Job's CFO Parts.
2. Resolve the approved CAD export for each Part.
3. Snapshot the exact export row onto the Job.
4. Block or warn if any required Part has no released export.

Likely join table:

```text
job_cfo_part_exports
  job_id
  part_id
  cad_export_id
```

Important rule: existing Jobs download the exports snapshotted for that Job. A later CAD import can create a newer export for the same Part, but it must not silently change an existing Job's downloadable file bundle.

### Step 8: Add Job page download

Add a Job page action to download manufacturing files.

Download flow:

1. User clicks "Download manufacturing files" on a Job.
2. API loads `job_cfo_part_exports`.
3. API fetches file bytes from artifact storage.
4. API returns a zip such as `JOB-1234-manufacturing-files.zip`.
5. If files are missing, the UI shows which Parts are missing released exports.

The zip should include a small manifest/readme so the downloaded bundle is inspectable outside the app.

### Step 9: Add operational checks

Once write flows exist, add checks that help the team keep CAD and app data aligned:

- Product has Parts with no released export for a required purpose.
- CAD export exists for an entity not used by any active Product or Job.
- Latest CAD source hash differs from the export snapshotted on an active Job.
- Manifest contains unknown Part codes.
- Manifest contains duplicate Part codes with different files.
- Export hash changed for the same entity, format, and purpose.

These should start as warnings, not hard blockers, until the business has used the workflow on real data.

## Implementation Order

1. SolidWorks property convention and example manifest.
2. Manifest schema in `pkg/schema`.
3. Preview reconciliation in `pkg/core`.
4. Thin API preview route.
5. Product-area UI for upload and preview.
6. Artifact storage decision and CAD export metadata tables.
7. Apply reviewed import.
8. Job-level export snapshot.
9. Job download zip.
10. Operational drift checks.

## Decisions Made

- Mapping is based on SolidWorks custom properties, not filenames.
- The export unit is a bundle containing `manifest.json` plus any number of manufacturing export files.
- Jedidah Ops should store or control released manufacturing exports used for Jobs.
- Job downloads should use job-specific snapshotted exports, not latest Part exports.
- The first app implementation should be preview-only.
- CAD provenance should be additive metadata around the current Product/Assembly/Part model.

## Open Questions

- Which requested files are Part-level only, and which should also be attached to Product or Assembly records?
- Are product, assembly, and part codes already stored in SolidWorks custom properties?
- Is there exactly one top-level SolidWorks assembly per sellable Product?
- Are SolidWorks sub-assemblies always the same granularity as Jedidah Ops Product Assemblies?
- Can the same SolidWorks part appear in multiple Products with the same business Part code?
- Which artifact storage should host released manufacturing files?
- Should a Job snapshot CAD exports at Job creation, production release, or first download?

## SolidWorks PDM Notes

SolidWorks PDM is not part of the first implementation because Jedidiah does not currently use it. The active plan remains a file-based export bundle from SolidWorks into Jedidah Ops.

PDM would become useful later if Jedidiah wants stronger control over release state, design history, and repeatable export tasks.

What PDM could add:

- A controlled vault for `.SLDASM`, `.SLDPRT`, `.SLDDRW`, `.DXF`, and any later export formats.
- Check-in/check-out so designers do not overwrite each other's files.
- File history with versions and, if the business adopts them, formal revisions.
- Workflow states such as `Work in Progress`, `For Review`, and `Released`.
- A clean release gate: only files in a `Released` state can be imported or snapshotted into Jedidah Ops.
- Data card variables mapped to SolidWorks custom properties such as `JED_PRODUCT_MODEL_CODE`, `JED_ASSEMBLY_CODE`, and `JED_PART_CODE`.
- Administrator-defined tasks for repeatable conversion, print, and validation work.

If PDM is adopted later, the integration boundary should not change much. Jedidah Ops should still import a manifest, store file hashes, copy released artifacts into app-owned storage, reconcile catalogue changes, and snapshot the exact exports used by a Job. PDM would mainly replace the manual file-share/export-folder discipline with a proper vault and workflow source.

Future PDM rule:

```text
Only Released PDM files can become released CAD exports in Jedidah Ops.
```

PDM should remain a future reliability upgrade, not a prerequisite for the first CAD sync slice.

## Future Reference

Ideas not needed for the first slice:

- Full SolidWorks PDM workflow integration.
- Background polling from PDM.
- Windows-hosted SolidWorks automation.
- SolidWorks Document Manager based headless extraction.
- Pack and Go based complete design bundle capture.
- Automatic Product/Assembly/Part creation from CAD with no human review.
- CAD source/export impact analysis across active and historical Jobs.

Useful SolidWorks surfaces:

- Pack and Go can gather a model and its related files, including assemblies, parts, drawings, and references.
- Document Manager API can read SolidWorks document metadata, configuration data, custom properties, components, and references.
- Task Scheduler can export SolidWorks documents to neutral/manufacturing formats.
- PDM data card variables can map to SolidWorks custom properties and can be used as release workflow gates.

Sources:

- SolidWorks Pack and Go overview: https://help.solidworks.com/2025/english/SolidWorks/sldworks/c_Pack_Go_Ovw_WPDM.htm
- SolidWorks Document Manager API namespace: https://help.solidworks.com/2025/english/api/swdocmgrapi/SolidWorks.Interop.swdocumentmgr~SolidWorks.Interop.swdocumentmgr_namespace.html
- SolidWorks Task Scheduler export files: https://help.solidworks.com/2024/English/SolidWorks/sldworks/HIDD_TASK_FILE_EXPORT.htm
- SolidWorks PDM variable mapping: https://help.solidworks.com/2023/english/EnterprisePDM/admin/c_mapping_variables_SOLIDWORKS.htm
