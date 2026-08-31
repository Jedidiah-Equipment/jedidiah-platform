# Reading Hour-Meter Photos with Vision AI

Date: 2026-08-31

**Question:** Foremen photograph a machine's hour meter at job start/stop. Can a vision LLM (Claude,
GPT-5-class, Gemini) pre-populate the numeric reading from the photo reliably enough that the foreman
only confirms or corrects it — and what capture UX maximizes accuracy, given poor farm connectivity?

Claims below trace to arXiv papers, peer-reviewed datasets, and first-party provider docs fetched
2026-08-31. Links inline.

## Feasibility verdict

**Ship it — as an advisory pre-fill with mandatory human confirmation, never as an unattended read.**
On digital LCD/LED readouts the best frontier VLMs read the value correctly roughly 80% of the time on
uncurated real-world photos ([MeasureBench](https://arxiv.org/abs/2510.26865): Gemini 2.5 Pro 80.2% on
the Digital category), and a purpose-built insurance odometer pipeline hit ~90% on good-quality photos
([Frontiers 2019](https://www.frontiersin.org/journals/applied-mathematics-and-statistics/articles/10.3389/fams.2019.00061/full))
— so with capture guidance, quality gating, and a monotonicity sanity check, a pre-fill that is right
~85–95% of the time and visibly flagged the rest is realistic. Analog **drum-style** meters are digit
drums, not pointer dials, so they behave closer to the digital case than to the catastrophic pointer-dial
numbers (GPT-5 scored 7.8% strict accuracy on pointer meters in
[DialBench](https://arxiv.org/html/2511.21982)) — but rolling digits and the colored tenths drum are
real 10x/off-by-one hazards. The guardrails that make it shippable: the foreman always confirms, the
value must be >= the last known reading and within a plausible delta, the model must return null rather
than guess, and confidence gates route doubtful reads to manual entry. Do not gate the foreman's workflow
on connectivity: capture and confirm should work fully offline (see the connectivity section).

## Evidence: how well do VLMs read meters and odometers?

### Vision-LLM benchmarks on gauges and displays

- **[MeasureBench](https://arxiv.org/abs/2510.26865)** (arXiv 2510.26865, Oct 2025) is the closest
  benchmark to this task: 2,442 questions (1,272 real-world photos) of instruments split into Dial,
  Digital, Linear, and Composite readouts, evaluated across 18 VLMs including GPT-5, GPT-5-Mini,
  Gemini 2.5 Pro/Flash, **Claude Opus 4.1 and Claude Sonnet 4**. Best overall was Gemini 2.5 Pro at
  **30.2%** value accuracy on real images — but split by readout type: **Digital 80.2%, Dial 31.5%,
  Linear 21.9%, Composite 3.8%**. The dominant failure is *indicator localization* (where the pointer
  sits), not digit OCR. Two negative results worth internalizing: step-by-step reading instructions
  gave "very limited" gains, and extended thinking/reasoning "sometimes even degrades performance."
- **[DialBench](https://arxiv.org/html/2511.21982)** (arXiv 2511.21982) evaluated 18 models on pointer
  (needle) meters: at a strict 1%-error threshold, **GPT-5 scored 7.8% and Gemini 2.5 Pro 15.8%**,
  versus 62.4% for their purpose-built MRLM model. Chain-of-thought *worsened* results. Takeaway: if a
  machine ever has a needle-style gauge, do not attempt an automated read at all. Drum hour meters are
  digit-based, so this worst case does not apply directly, but it calibrates expectations for anything
  requiring sub-digit spatial judgment (e.g., a drum caught mid-roll).
- **[OCRBench](https://arxiv.org/html/2305.07895v7)** (arXiv 2305.07895) established that large
  multimodal models are competitive at general text recognition but degrade on blurred, low-resolution,
  and non-standard text — the regime a dirty, glare-struck hour meter lives in.
- **[Context-independent OCR with multimodal LLMs](https://arxiv.org/abs/2503.23667)** (arXiv
  2503.23667) is directly relevant because an hour reading has *no linguistic context* to error-correct
  against: MLLMs "can match conventional OCR methods at about 300 ppi, yet their performance
  deteriorates significantly below 150 ppi." Resolution of the digits in the crop matters more than
  anything else we control.

### Domain datasets and specialized-model baselines (the ceiling to compare against)

- **[TRODO](https://pmc.ncbi.nlm.nih.gov/articles/PMC8424208/)** (Data in Brief, 2021): 2,389 public
  odometer photos labeled analog/digital with per-digit boxes — the natural evaluation set if we want
  to bench models ourselves before building (hour meters are visually near-identical to odometers).
- **[Mileage Extraction From Odometer Pictures for Automating Auto Insurance Processes](https://www.frontiersin.org/journals/applied-mathematics-and-statistics/articles/10.3389/fams.2019.00061/full)**
  (Frontiers, 2019; 6,209 real insurance-claim odometer photos, 21% rated poor quality): a two-stage
  detector achieved **85.4% end-to-end accuracy overall and 90% on good-quality images**. Most errors
  came from character recognition; post-processing errors included "failure to distinguish mileage from
  other numbers" and "identifying the digit after the decimal point" — the exact tenths-digit hazard on
  hour meters. Their recommendations are our UX spec: guided alignment within a bounding box, enforced
  minimum image quality with real-time feedback, confidence-gated auto-accept, and manual entry when
  uncertain.
- **[UFPR-AMR / CNNs for Automatic Meter Reading](https://arxiv.org/abs/1902.09600)**: on 2,000 utility
  meter photos, a specialized CNN reached **94.13% counter recognition**; the follow-up
  [dial-meter work](https://arxiv.org/abs/2005.03106) needed dedicated pointer models. Specialized
  detectors still beat general VLMs on this task class — relevant if accuracy ever needs to go past
  what prompting can deliver.
- **[Anyline's commercial meter/odometer SDK](https://anyline.com/products/odometer-scanner)** (used in
  insurance and utilities) is the buy-option existence proof: on-device, works fully offline, digital
  and analog odometers, [guided capture with a scan cutout](https://documentation.anyline.com/android-sdk-component/latest/technical-capabilities/odometer.html),
  and a marketing-claimed 99% accuracy. Patents in this space
  ([US10534968B1](https://patents.google.com/patent/US10534968B1/en),
  [US20210233180A1](https://patents.google.com/patent/US20210233180A1/en)) describe the same loop:
  capture, OCR, compare against a manual entry, confidence-score the pair.

### What the providers themselves say

- **Anthropic ([vision docs](https://platform.claude.com/docs/en/build-with-claude/vision))**: Claude
  ingests images as 28×28-px patches; standard-tier models downscale anything over a **1568 px long
  edge** (high-res tier: 2576 px), so a full-dashboard 4K photo reaches the model at ~1.5 MP and the
  digits may be tiny. The docs say outright: "Claude might hallucinate or make mistakes when
  interpreting low-quality, rotated, or very small images under 200 pixels," and advise ensuring text
  is "legible and not too small," pre-resizing/cropping rather than letting the API downscale, and
  watching JPEG compression artifacts on text.
- **OpenAI ([images & vision guide](https://developers.openai.com/api/docs/guides/images-vision))**:
  images are scaled to fit 2048×2048 then the shortest side to **768 px**, tokenized in **512-px
  tiles** (`detail: high` for anything with small text). Documented limitations include "small text"
  ("Enlarge text within the image to improve readability") and misreading "rotated or upside-down text."
- Both sets of guidance converge on the same engineering move: **crop to the meter window on device and
  send a tight, high-resolution crop**, rather than the full photo.

## Failure modes to design for

1. **Glare/reflection** on the LCD or the drum-meter lens — washes out segments/digits; the top image
   category flagged in the [insurance odometer study](https://www.frontiersin.org/journals/applied-mathematics-and-statistics/articles/10.3389/fams.2019.00061/full)
   and in [Anyline's field guidance](https://anyline.com/news/utility-field-service-meter-reading).
2. **Oblique angle and rotation** — both [OpenAI](https://developers.openai.com/api/docs/guides/images-vision)
   and [Anthropic](https://platform.claude.com/docs/en/build-with-claude/vision) document degraded
   accuracy on rotated text; drum digits also self-occlude at an angle.
3. **Low digit resolution** — accuracy falls off a cliff below ~150 ppi on the characters
   ([arXiv 2503.23667](https://arxiv.org/abs/2503.23667)); a full-scene photo downscaled by the API
   makes this worse (see provider tiling rules above).
4. **Dirt, scratches, motion blur, low light** — engine bays vibrate and cabs are dusty; OCRBench-class
   degradation on blurred/low-quality text applies ([arXiv 2305.07895](https://arxiv.org/html/2305.07895v7)).
5. **Mid-roll drum digits** — a drum caught between two positions is a genuine ambiguity even for
   humans; this is a sub-digit *localization* judgment, the exact thing MeasureBench identifies as
   VLMs' weakest skill ([arXiv 2510.26865](https://arxiv.org/abs/2510.26865)). Expect off-by-one errors
   in the rolling column.
6. **Tenths digit read as a whole digit (10x error)** — hour meters typically show tenths as a
   final drum in a different color or after a separator; the insurance study explicitly lists
   "identifying the digit after the decimal point" among its residual errors
   ([Frontiers 2019](https://www.frontiersin.org/journals/applied-mathematics-and-statistics/articles/10.3389/fams.2019.00061/full)).
   `12345.6` read as `123456` is the single most damaging plausible error for us.
7. **Seven-segment confusions** — partially lit or glare-hit segments turn 8↔0/6, 1↔7, 5↔6; general
   OCR (and Apple's own scanner, below) is notoriously weak on seven-segment fonts.
8. **Hallucinated plausible numbers when illegible** — Anthropic's docs state the hallucination risk on
   low-quality images plainly ([vision docs](https://platform.claude.com/docs/en/build-with-claude/vision));
   a confidently wrong 5-digit number is worse than a refusal, so the prompt must make null a supported
   answer (the pattern `pkg/ai` already uses for invoices).
9. **Dropped/added leading zeros and off-by-one digit counts** — an hour meter's leading zeros carry no
   information but a dropped *internal* digit does; validate digit count against the meter's known
   format where we have it.
10. **Reading the wrong number** — dashboards carry RPM, serial plates, and job stickers; "failure to
    distinguish mileage from other numbers" was a documented error class in the insurance pipeline
    (same Frontiers paper). Tight cropping largely eliminates this.

## Mitigation patterns (with sources)

- **Structured output, null over guess.** Ask for JSON `{ hours, tenths, digitsSeen, legible }` via
  `generateObject` with nullable-required fields — exactly the contract `pkg/ai`'s
  `supplier-invoice-extraction.ts` already implements, including the prompt language "never infer …
  use null instead." Repo constraint: **no `.default()` in generateObject schemas** (OpenAI strict
  mode 400s; documented in that file and in project memory).
- **Do not trust self-reported confidence.** Verbalized LLM confidence is systematically overconfident
  and poorly calibrated ([Xiong et al., "Can LLMs Express Their Uncertainty?"](https://arxiv.org/abs/2306.13063);
  [On Verbalized Confidence Scores for LLMs](https://arxiv.org/abs/2412.14737)). Use a confidence
  *proxy* instead: agreement across reads and passing the sanity checks.
- **Read twice / self-consistency.** Sampling multiple answers and majority-voting measurably improves
  reasoning accuracy ([Wang et al., Self-Consistency](https://arxiv.org/abs/2203.11171)); for a numeric
  read, two independent calls that agree is a far better gate than a self-reported score, and
  disagreement is a cheap, honest "not sure" signal. (Caveat: MeasureBench found *extended thinking*
  does not help this task class — spend the budget on a second sample, not on reasoning tokens.)
- **Digit-by-digit transcription.** Asking for `digitsSeen` as an array (one entry per drum/segment
  position, with the tenths digit its own field) forces the model to commit per-position and lets us
  validate digit count and reconstruct the value ourselves — the same decomposition every specialized
  odometer pipeline uses ([Frontiers 2019](https://www.frontiersin.org/journals/applied-mathematics-and-statistics/articles/10.3389/fams.2019.00061/full)).
- **Monotonic sanity check.** Hour meters only increase. Reject or flag any read `< lastKnownHours` or
  `> lastKnownHours + plausibleDelta` (machine-hours since the last reading bounded by wall-clock time
  since it). This converts most 10x tenths errors and misreads into an automatic flag, no AI required.
  The [mileage-verification patent literature](https://patents.google.com/patent/US10534968B1/en) uses
  the same cross-check idea (compare extracted vs. expected, score the discrepancy).
- **Image-quality gating on device.** The insurance study's headline UX finding: enforcing minimum
  image quality with real-time feedback moved accuracy from 85.4% to ~90%
  ([Frontiers 2019](https://www.frontiersin.org/journals/applied-mathematics-and-statistics/articles/10.3389/fams.2019.00061/full)).
  A cheap Laplacian-variance blur check plus overexposure (glare) histogram check on the cropped region
  runs fine on-device before anything is saved.
- **Send a tight, high-res crop.** Follow provider guidance: crop to the guided frame, keep the digit
  strip well above 150 ppi ([arXiv 2503.23667](https://arxiv.org/abs/2503.23667)), stay under
  Anthropic's 1568 px long-edge no-resize threshold so the API never downscales
  ([Anthropic vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)), and use
  `detail: high` on OpenAI ([OpenAI guide](https://developers.openai.com/api/docs/guides/images-vision)).
- **Deterministic settings.** Temperature 0 for the read calls (the convention in published MLLM OCR
  evaluations, e.g. [arXiv 2503.23667](https://arxiv.org/abs/2503.23667)); `maxRetries: 0` and treat a
  refusal as a supported outcome, per the existing invoice-extraction pattern.

## Recommended capture-and-confirm flow

1. **Open camera with a guided overlay**: a letterbox frame sized for a meter window, with a one-line
   hint ("Fill the frame with the hour meter. Avoid glare."). Torch toggle prominent (meters live in
   dark cabs). This is the standard pattern in odometer/meter SDKs
   ([Anyline odometer capture](https://documentation.anyline.com/android-sdk-component/latest/technical-capabilities/odometer.html)).
2. **Live quality feedback**: run blur/exposure checks on the framed region each preview frame; show
   "Hold steady" / "Tilt to kill the glare" states. Auto-capture when the frame is stable and passes,
   with a manual shutter always available.
3. **On capture, gate locally**: if the crop fails blur/glare thresholds, immediately offer **Retake**
   with the specific reason. Never send a photo we already know is unreadable.
4. **Provisional read**: run the read (on-device OCR immediately; server LLM when online — see next
   section). Two temperature-0 samples; proceed only if they agree, else treat as low confidence.
5. **Sanity checks**: digits parse to a number, digit count plausible for this machine, value
   `>= lastKnownHours` and within the plausible delta. Any failure demotes to low confidence.
6. **Confirm screen — one-tap path**: show the cropped photo above a large pre-filled numeric field
   (tenths rendered distinctly, e.g. `4 213`**`.6`**), with the delta since last reading ("+7.5 h since
   Tue"). A single **Confirm** button saves. This mirrors the auto-accept-or-review loop in
   [US20210233180A1](https://patents.google.com/patent/US20210233180A1/en).
7. **Low confidence path**: same screen, but the field is empty (or shows the guess visually struck as
   a suggestion, never pre-filled), keyboard already open, photo zoomable. Options: type the reading,
   or **Retake**.
8. **Save**: persist `{ photo, aiReading, aiAgreed (samples matched), confirmedReading, wasEdited }`.
   `wasEdited` is the free evaluation dataset for tuning thresholds later.
9. **Out-of-range confirm**: if the foreman types/confirms a value that fails the monotonic check,
   allow it but require an explicit "meter replaced / previous reading wrong" acknowledgment — meters
   do get swapped.

## Manual-entry fallback design

- Manual entry is a **first-class path, not an error state**: reachable in one tap from every screen in
  the flow ("Enter hours instead"), because some meters will be broken, fogged, or unreachable.
- Numeric keypad with an explicit, separate tenths cell — the 10x hazard applies to humans typing from
  the photo too. Still capture the photo when possible (audit trail + later re-read).
- The same monotonic/delta validation runs on manual entries; violations get the acknowledge step, not
  a hard block.
- If no photo is possible at all (meter dead), allow entry with a required reason; flag the record.

## Offline / poor-connectivity recommendation

"Confirm at capture time" and "LLM in the cloud" conflict on a farm with no signal, so split the read:

- **On-device provisional read at capture (works offline).**
  [Apple's Vision framework text recognition](https://developer.apple.com/documentation/vision/vnrecognizetextrequest)
  and [Google ML Kit text recognition v2](https://developers.google.com/ml-kit/vision/text-recognition/v2)
  are first-party, free, and fully on-device — but both target natural-scene text and are
  **community-documented as unreliable on seven-segment fonts**
  ([Apple developer forum thread on DataScannerViewController and seven-segment displays](https://discussions.apple.com/thread/254467728)).
  Expect them to do acceptably on drum meters (printed digits) and inconsistently on LCD/LED
  seven-segment; measure on TRODO + our own photos before trusting either. If on-device accuracy on
  seven-segment matters and measurement says the free OCR isn't enough, the options are a small custom
  digit model (the [UFPR-AMR line of work](https://arxiv.org/abs/1902.09600) shows ~94% is attainable
  with modest CNNs) or the commercial [Anyline SDK](https://anyline.com/products/ocr-meter-reading),
  which is built for exactly this and runs offline.
- **Offline behavior**: photo + crop + provisional read (or manual entry) are captured and confirmed
  entirely locally, then queued — the app already needs an offline queue for job start/stop events, and
  the reading rides with them. The foreman is never blocked on connectivity.
- **Server-side LLM verification after upload**: when the photo lands, run the vision-LLM read
  (`pkg/ai` pattern) and compare against the confirmed value. Agreement: done. Disagreement: raise a
  back-office review flag on the job event — do *not* ping the foreman hours later to re-confirm a
  number he already confirmed; the desk resolves it against the photo.
- **When online at capture**, the LLM read can replace the on-device provisional read in step 4
  directly (it is the more accurate reader on drum meters per the evidence above); keep the on-device
  path as the universal fallback rather than a separate mode.

## Prior art in this repo (`pkg/ai`)

`/Users/dean/_repo/jedidiah-equipment/jedidiah-platform/pkg/ai` already contains almost the whole
server-side pattern this feature needs:

- **Provider/SDK**: Vercel AI SDK v6 with the OpenAI provider via the Responses API
  (`src/ai-sdk-model.ts`, `createOpenAI(...).responses(model)`); `@pkg/api` owns key/model config and
  injects dependencies through `AiContext` (`AGENTS.md` forbids env reads and API imports in `pkg/ai`).
- **`src/supplier-invoice-extraction.ts` is the template to copy**: `generateObject` over an attached
  file, a system prompt that mandates transcription-only and null-over-guess, a *model-facing* schema
  (required-and-nullable fields) deliberately separate from the persisted schema, a normalization pass
  that salvages partial reads, and `maxRetries: 0` with refusal as a supported outcome. Its long
  comment documents the strict-mode constraint: **never `.default()` in a generateObject schema** — the
  AI SDK emits it as optional, strict mode rejects the request.
- Also present: existing structured-extraction test patterns (`supplier-invoice-extraction.test.ts`,
  `catalog-translation.ts`) and the tool/entity layout under `src/tools/` if the read is ever exposed
  to the assistant. An `hour-meter-extraction.ts` sibling module with an image content part instead of
  a PDF is a small, well-trodden addition.
- Nothing in the repo yet does on-device OCR or mobile camera capture; the mobile app (Expo SDK 56,
  locked — see project memory) would take ML Kit / Vision-framework integration as new work, and Expo
  camera + a crop overlay are standard Expo territory.

## Open questions

1. **Which meters does the fleet actually have?** Inventory drum vs. LCD vs. LED per machine model;
   if any machine has a needle-style gauge, exclude it from AI reads entirely (DialBench numbers).
2. **Measured accuracy on our own photos**: run ~100 real fleet meter photos (and TRODO as a proxy)
   through the candidate LLM and through ML Kit/Apple Vision before fixing thresholds — every number
   above is from adjacent domains, not our exact meters.
3. **On-device OCR floor**: is free first-party OCR good enough on our seven-segment LCDs to serve as
   the offline provisional read, or does offline mean manual-entry-first with server verification later?
4. **Known meter formats per machine**: storing digit count + has-tenths per machine model makes the
   digit-count and 10x checks much sharper — is that worth a schema field?
5. **plausibleDelta policy**: max believable hours/day per machine class (a tractor can't accrue 30 h
   in 24 h) — needs a domain decision.
6. **Cost/latency budget**: a tight crop is ~1,000–1,600 visual tokens per read on Claude-class pricing
   (two samples double it) — fine at fleet scale, but confirm against expected volume.
