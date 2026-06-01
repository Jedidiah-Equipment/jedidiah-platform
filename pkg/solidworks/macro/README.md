# SolidWorks CAD Export Macro

This package contains the v1 Jedidiah SolidWorks macro for exporting CNC DXF files from a top-level Product assembly.

The macro is stored as a reviewable `.bas` source file instead of a binary `.swp` file:

```text
pkg/solidworks/macro/macro/JedidiahPartDxfExport.bas
```

## Scope

This v1 package runs from the active top-level `.SLDASM`, finds coded Product Assemblies and coded Parts, exports Part DXFs, and writes a `manifest.json` shaped around the durable Product -> Assembly -> Part hierarchy.

Only Part DXFs are exported today. Product and Assembly nodes already include `exports` arrays so later Product-level and Assembly-level files can be added by extending those arrays instead of changing the manifest shape.

Out of scope:

- Exporting Product or Assembly files in v1.
- Non-DXF file types such as `.SLDASM`, `.SLDPRT`, `.SLDDRW`, `.PDF`, or `.DWG`.
- Copying existing department files into the output folder.
- App-side import code.
- Pack and Go source archives.

## SolidWorks Setup

Set these custom properties:

```text
JED_PRODUCT_MODEL_CODE  on the top-level Product .SLDASM
JED_ASSEMBLY_CODE       on each Product Assembly .SLDASM
JED_PART_CODE           on each Part .SLDPRT
```

The macro blocks when the active top-level assembly is missing `JED_PRODUCT_MODEL_CODE`.

Referenced sub-assemblies without `JED_ASSEMBLY_CODE` are traversed, but Parts below them are skipped unless a child assembly has an assembly code. Parts without `JED_PART_CODE` are skipped and recorded as warnings in the manifest.

## Install

1. Open SolidWorks.
2. Go to `Tools > Macro > New`.
3. Save a new macro file, for example `JedidiahCadExport.swp`.
4. The VBA editor opens.
5. In the VBA editor, right-click the macro project and choose `Import File`.
6. Select `pkg/solidworks/macro/macro/JedidiahPartDxfExport.bas`.
7. Save the macro project.

## Usage

1. Open the top-level Product `.SLDASM`.
2. Confirm the Product, Assembly, and Part custom properties are set.
3. Run `JedidiahPartDxfExport`.
4. Choose an output folder when prompted.

The macro creates an export folder like:

```text
cad-export-20260601-143000/
  manifest.json
  files/
    P-1001.dxf
    P-1002__LH.dxf
```

If a referenced Part configuration is not `Default`, the configuration is included in the DXF filename:

```text
files/P-1001__LH.dxf
```

## Limitations

- The active document must be the top-level Product assembly.
- The macro exports referenced Part/configuration pairs once and reuses the generated DXF path if the same Part appears in multiple coded assemblies.
- Product and Assembly `exports` arrays are present but empty in v1.
- The macro uses SolidWorks sheet-metal flat-pattern DXF export. Non-sheet-metal Parts may not produce a DXF.
- SolidWorks/VBA compilation is not part of repo verification; test the macro inside SolidWorks before relying on production exports.

See `docs/manifest.md` for the manifest contract.
