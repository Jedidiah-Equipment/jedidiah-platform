# CAD Export Manifest

The SolidWorks macro writes a `manifest.json` beside the generated `files/` directory. The manifest is the operational index for exported manufacturing files.

V1 exports only Part DXFs, but the manifest is already structured as Product -> Assemblies -> Parts. Product and Assembly objects include `exports` arrays that are empty in v1 and can be populated later without changing the schema spine.

The manifest does not reference files inside Pack and Go archives. If a Pack and Go source archive is captured later, it should remain a separate reference artifact.

## Contract

```json
{
  "schemaVersion": 1,
  "sourceSystem": "solidworks",
  "exportKind": "cad-export",
  "exportedAt": "2026-06-01T14:30:00.000",
  "solidWorksVersion": "34.0.0",
  "product": {
    "modelCode": "TRAILER-750",
    "name": "TRAILER-750",
    "source": {
      "fileName": "TRAILER-750.SLDASM",
      "filePath": "C:\\SolidWorks\\Products\\TRAILER-750.SLDASM",
      "configuration": "Default"
    },
    "exports": [],
    "assemblies": [
      {
        "code": "CHASSIS",
        "name": "CHASSIS",
        "source": {
          "fileName": "CHASSIS.SLDASM",
          "filePath": "C:\\SolidWorks\\Products\\CHASSIS.SLDASM",
          "configuration": "Default"
        },
        "exports": [],
        "parts": [
          {
            "partCode": "P-1001",
            "name": "P-1001",
            "quantity": 2,
            "source": {
              "fileName": "P-1001.SLDPRT",
              "filePath": "C:\\SolidWorks\\Parts\\P-1001.SLDPRT",
              "configuration": "Default"
            },
            "exports": [
              {
                "fileName": "P-1001.dxf",
                "relativePath": "files/P-1001.dxf",
                "format": "dxf",
                "purpose": "cnc-part",
                "hash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              }
            ]
          }
        ]
      }
    ]
  },
  "warnings": []
}
```

## Fields

- `schemaVersion`: Manifest shape version. V1 is `1`.
- `sourceSystem`: Always `solidworks`.
- `exportKind`: Stable export family, currently `cad-export`.
- `exportedAt`: Local export timestamp written by the macro.
- `solidWorksVersion`: SolidWorks revision number when available.
- `product.modelCode`: Value of `JED_PRODUCT_MODEL_CODE` on the active top-level assembly.
- `product.name`: Display name for the Product. V1 uses the source assembly basename.
- `product.source`: Source `.SLDASM` metadata for the top-level Product assembly.
- `product.exports`: Product-level exported files. Empty in v1.
- `product.assemblies[].code`: Value of `JED_ASSEMBLY_CODE` on the referenced sub-assembly.
- `product.assemblies[].name`: Display name for the Product Assembly. V1 uses the source assembly basename.
- `product.assemblies[].source`: Source `.SLDASM` metadata for the Product Assembly.
- `product.assemblies[].exports`: Assembly-level exported files. Empty in v1.
- `product.assemblies[].parts[].partCode`: Value of `JED_PART_CODE` on the referenced Part.
- `product.assemblies[].parts[].name`: Display name for the Part. V1 uses the source Part basename.
- `product.assemblies[].parts[].quantity`: Occurrence count for that Part/configuration under the coded Product Assembly.
- `product.assemblies[].parts[].source`: Source `.SLDPRT` metadata for the Part.
- `exports[].fileName`: Generated export filename.
- `exports[].relativePath`: Path to the export relative to the manifest.
- `exports[].format`: File format, currently `dxf` for v1.
- `exports[].purpose`: File purpose, currently `cnc-part` for v1.
- `exports[].hash`: SHA-256 hash in `sha256:<hex>` format.
- `warnings`: Non-blocking issues observed during export, including skipped uncoded assemblies or Parts.

## Rules

- V1 writes only generated Part DXF files under `files/`.
- Product and Assembly `exports` arrays are present for future file support but remain empty in v1.
- The macro requires `JED_PRODUCT_MODEL_CODE` on the active top-level Product assembly.
- Parts are included only when they are under a sub-assembly with `JED_ASSEMBLY_CODE`, have `JED_PART_CODE`, and successfully export a DXF.
- The manifest does not describe `.SLDPRT`, `.SLDDRW`, `.SLDASM`, `.PDF`, `.DWG`, or Pack and Go contents as exported files in v1.
- Future app import code should match Product, Assembly, and Part rows by their `JED_*` codes rather than filenames.
