# Stores Label Hardware

Date: 2026-09-28

The stores PC and the Stores Tablet share one scanner model, and Part labels and badge cards print
from one printer onto one label stock. These facts size the label PDF (`pkg/pdf`) and decide its
symbology; they were confirmed with product on 2026-09-28 while grooming
[#1568](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/1568).

## Hardware

| Item | Model | Facts that matter |
| --- | --- | --- |
| Scanner (PC and tablet) | NETUM C750 | CMOS global-shutter 2D imager, 640 × 480. Minimum element 4 mil (0.10 mm) for 1D, 5 mil (0.127 mm) for 2D. Reads Code 128, QR, Data Matrix, PDF417, from paper and screens. Bluetooth, 2.4 GHz dongle, or USB. |
| Printer | Aimo D520BT | Direct thermal, 203 dpi (dot pitch 0.125 mm). Media width 20 to 115 mm, max print width 108 mm. TSPL. USB and Bluetooth. Driven from Windows through the browser print dialog. |
| Label stock | 40 × 30 mm | Same roll for Part labels and stores badge cards. |

## What follows for the label PDF

- The PDF page must be exactly 40 × 30 mm and printed at 100%. Any print-dialog scaling shrinks the
  bars below what the scanner resolves; that was the cause of #1568.
- A barcode module must be a whole number of printer dots or the bars print unevenly. At 203 dpi a
  dot is 0.125 mm (1 dot sits at the scanner's 1D floor), so modules come in 0.125 mm steps from
  0.25 mm.
- Code 128 at 0.25 mm holds about 8 mixed characters across 40 mm. The badge token `badge:<userId>`
  is 38 characters and many Part codes exceed 8, so the label symbology is QR, error correction M.
- The bigger the module, the faster the scanner locks on (#1578). The symbol sits top-left with the
  name and location in a column beside it and the code as one line across the bottom, and takes the
  largest whole-dot module whose four-module quiet zone stays on the label and clear of the column
  and that line; the dark modules never come within 2 mm of the edge. A Part code of up to 13
  characters prints at 0.75 mm (6 dots), about 16 mm square; a badge token at 0.625 mm (5 dots),
  about 18 mm. A longer legacy code steps down on its own.
- The tablet camera fallback (`ScanCameraModal.tsx`) must list every symbology in circulation:
  `qr` plus `code128` while old labels are still on the shelves.

## Sources

- Scanner: [NETUM C750 specifications](https://support.netum.net/hc/en-us/articles/43429771172251-C750-Barcode-Scanner-Complete-Specifications), bought as the [Takealot C750 listing](https://www.takealot.com/portable-2d-barcode-scanner-c750-bluetooth-usb-wireless-qr-reade/PLID101003167).
- Printer: [Aimo D520BT product page](https://www.aimotech.com/product/d520bt-shipping-label-printer/); resolution from the [Phomemo D520-BT listing](https://phomemo.com/products/d520-bt-bluetooth-shipping-label-printer) (same unit).
