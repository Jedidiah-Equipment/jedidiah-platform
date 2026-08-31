# Speech-to-Text for South African Farm Voice Notes

Date: 2026-08-31

**Question:** Which speech-to-text options handle South African English accents, Afrikaans, and
local languages/dialects (e.g. Sesotho and other Sotho-Tswana languages) well for short voice
notes? Context: JedConOps foremen and workshop staff record voice notes describing machine
breakdowns; the app transcribes them to editable text, with a tunable prompt carrying local
vocabulary (driver names, farm names, machine terms) and a correction-diff feedback loop. See
wayfinder ticket #1370 (map #1359).

Claims trace to provider first-party docs and pricing pages plus the Whisper paper; links inline.
Method caveats: pages were read via web summarization (Google/Azure pricing from the rendered
pages); the Whisper 34.1% Afrikaans FLEURS figure came from search extraction of the paper's
Table 13 rather than a direct table read; ElevenLabs Scribe v2 mid-sentence code-switching claims
appear in third-party coverage but not verbatim in ElevenLabs' own docs.

## TL;DR / Recommendation

**Primary: ElevenLabs Scribe v2.** The only major API with *official* coverage of Zulu, Xhosa,
and Sepedi (Northern Sotho) alongside Afrikaans and English; publishes honest per-language WER
tiers; largest custom-vocabulary mechanism (keyterm prompting, up to 1,000 terms); built-in
filler-word removal mode; directly supported by the Vercel AI SDK's `transcribe()` (`scribe_v2`).
Batch price ~$0.22/hr (~$0.0037/min) — cheaper than whisper-1.

**Fallback: keep OpenAI (`gpt-4o-transcribe` / `whisper-1`) for English/Afrikaans-dominant
notes** — zero new infra in `pkg/ai`, and the `prompt` parameter is a natural fit for a rotating
vocabulary — but Zulu/Xhosa/Sotho/Tswana are simply **not in Whisper's language set**, so notes in
those languages will be mangled or "translated" unpredictably.

**Either way, run a post-ASR LLM correction pass.** The correction-diff feedback loop maps far
better onto an LLM cleanup step (glossary + few-shot diffs in the prompt) than onto any provider's
native biasing, and it is provider-agnostic — the tuning asset (the diff corpus) survives an ASR
vendor swap. Use native biasing (Scribe keyterms / Whisper prompt) *only* for the top-N proper
nouns, because a name the ASR never emitted phonetically can't be recovered by the LLM.

Realism check: for the Bantu languages, *every* provider's WER is in the 25–50% band (Scribe's own
tiering). The editable-transcript UX is not a nice-to-have — it is the product. English and
Afrikaans notes will be good; Sotho/Zulu notes will need heavy editing on any provider today.

## Per-provider findings

### OpenAI (whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe)

- **Languages:** Whisper's language set ([tokenizer.py](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py))
  includes **`af` (Afrikaans)** but **no `zu`, `xh`, `st`, `tn`, or `nso`**. The
  [STT guide](https://developers.openai.com/api/docs/guides/speech-to-text) says "Whisper supports
  98 languages, but accuracy varies by language". English is generic `en` — no en-ZA accent
  variant, though Whisper is generally accent-robust.
- **Current lineup (Aug 2026 docs):** a newer **`gpt-transcribe`** is now recommended, with
  `gpt-4o-transcribe`/`-mini-` described as legacy; `gpt-transcribe` adds **`keywords` and
  `languages` parameters** plus streaming; `whisper-1` alone offers timestamps/subtitles.
- **Code-switching:** none official. Whisper architecturally predicts a single language token per
  30-second window ([Whisper paper, arXiv:2212.04356](https://arxiv.org/abs/2212.04356)) — mixed
  EN/AF/Sotho in one utterance is out-of-contract.
- **Biasing:** `whisper-1` prompt has a **224-token limit** and "doesn't follow instructions like
  a general-purpose text model"; helps with product names, technical terms, acronyms.
- **Fillers:** no removal option documented (the prompt trick is for *keeping* them).
- **Price:** whisper-1 **$0.006/min**; gpt-4o-transcribe ≈$0.006/min; gpt-4o-mini-transcribe
  ≈$0.003/min ([pricing](https://developers.openai.com/api/docs/pricing)).

### Google Cloud STT v2 (Chirp 3) + Gemini

- **Languages** ([supported languages](https://cloud.google.com/speech-to-text/v2/docs/speech-to-text-supported-languages)):
  **af-ZA, zu-ZA, xh-ZA, nso-ZA on chirp_3**; st-ZA, tn-Latn-ZA, ss-Latn-ZA, ve-ZA, ts-ZA on
  legacy `long`/`short` models only. Strikingly, **en-ZA does not appear in the v2 table**. This
  is the widest official SA-language matrix of any provider.
- **Code-switching:** [Chirp 3](https://cloud.google.com/speech-to-text/v2/docs/chirp_3-model)
  supports `language_codes=["auto"]` — infers the *most prevalent* language, not intra-utterance
  switching.
- **Biasing:** [model adaptation](https://cloud.google.com/speech-to-text/v2/docs/adaptation-model)
  phrase sets + boost; chirp_3 up to 1,000 phrases.
- **Price:** V2 standard **$0.016/min** tiering down to $0.004; dynamic batch $0.003/min
  ([pricing](https://cloud.google.com/speech-to-text/pricing)). Sync `Recognize` targets <1-minute
  audio — the voice-note shape. Word timestamps/confidence unreliable on Chirp 3.
- **Gemini audio wildcard:** 32 tokens/sec ≈ **$0.002/min** at 2.5 Flash pricing
  ([audio docs](https://ai.google.dev/gemini-api/docs/audio),
  [pricing](https://ai.google.dev/gemini-api/docs/pricing)); fully promptable but not a
  benchmarked ASR product — hallucination risk on noisy workshop audio.

### Azure AI Speech

- **Languages** ([language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=stt)):
  **en-ZA, af-ZA, zu-ZA; no xh/st/tn/nso.** The only provider with an explicit en-ZA accent model.
  Phrase list is en-ZA only; af/zu get plain-text custom model training.
- **Code-switching:** [language identification](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-identification)
  states: "Continuous LID doesn't support changing languages within the same sentence."
- **Fillers:** TrueText [display-text pipeline](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/display-text-format)
  includes disfluency removal.
- **Price:** real-time $1/hr ($0.0167/min); batch $0.18/hr ($0.003/min)
  ([pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)).
  Heaviest integration; not in the AI SDK transcription provider list.

### AssemblyAI

- Flagship **Universal-3.5 Pro supports only 18 languages — no SA languages, not even Afrikaans**
  (legacy Universal-2 has `af`) ([supported languages](https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio/supported-languages)).
  Slam-1 is deprecated. Best-in-class biasing mechanics
  ([keyterms ≤1,000](https://www.assemblyai.com/docs/pre-recorded-audio/keyterms-prompting)) and
  fillers removed by default, at $0.0035/min — but the wrong language matrix for this use case.

### ElevenLabs Scribe v2

- **Languages** ([STT docs](https://elevenlabs.io/docs/capabilities/speech-to-text)): tiers place
  **English "Excellent (≤5% WER)", Afrikaans "Good (>10–≤20%)", Zulu, Xhosa and Northern Sotho
  "Moderate (>25–≤50%)"**; Southern Sotho and Tswana not listed. Publishing per-language tiers at
  all is unique among these vendors.
- **Code-switching:** Scribe v2 (Jan 2026) has "smart language detection"
  ([models](https://elevenlabs.io/docs/overview/models)); v1 launch claimed FLEURS/Common Voice
  leadership over Whisper large-v3, Gemini 2.0 Flash, Deepgram Nova-3
  ([blog](https://elevenlabs.io/blog/meet-scribe)). Mid-sentence switching claims are third-party
  only — treat as unverified.
- **Biasing:** keyterm prompting — up to 1,000 terms (batch), 50 chars each; surcharge $0.05/hr
  ([API pricing](https://elevenlabs.io/pricing/api)).
- **Fillers:** non-verbatim default; explicit no-verbatim mode removes disfluencies.
- **Price:** batch **$0.22/hr (~$0.0037/min)**; realtime $0.39/hr. AI SDK lists `scribe_v2` under
  the ElevenLabs transcription provider ([AI SDK](https://ai-sdk.dev/docs/ai-sdk-core/transcription)).

### Others (briefly)

- **Deepgram:** `af` but no Nguni/Sotho; `multi` code-switching covers 10 European/Asian languages
  only ([models](https://developers.deepgram.com/docs/models-languages-overview)). Not a fit.
- **Speechmatics:** no Afrikaans or SA Bantu languages
  ([supported languages](https://docs.speechmatics.com/introduction/supported-languages)). Not a fit.
- **Gladia:** true `code_switching=true`, but only Afrikaans + English from the target set
  ([supported languages](https://docs.gladia.io/chapters/language/supported-languages)).

## Comparison table

| Provider / model | SA coverage (official) | Code-switching | Custom vocab | Filler cleanup | ~$/min (batch) |
|---|---|---|---|---|---|
| OpenAI whisper-1 / gpt-4o-transcribe | `af` only; generic `en` | None; one language per window | `prompt` (224 tok) / `keywords` | Not offered | $0.006 / $0.003 |
| Google Chirp 3 | af-ZA, zu-ZA, xh-ZA, nso-ZA; st/tn on legacy; no en-ZA | `auto` picks dominant language | Phrase sets ≤1,000 + boost | Not documented | $0.016 (batch $0.003) |
| Azure AI Speech | en-ZA, af-ZA, zu-ZA | Not within a sentence | Phrase list (en-ZA only) | Yes (TrueText) | $0.0167 (batch $0.003) |
| AssemblyAI U-3.5 Pro | None | Within 18 languages only | keyterms ≤1,000 + prompt | Default | $0.0035 |
| ElevenLabs Scribe v2 | en, af, zu, xh, nso (WER tiers published) | Smart detection; v2 multilingual-in-one-file | Keyterms ≤1,000 (+$0.05/hr) | Yes (non-verbatim) | $0.0037 |
| Gemini Flash | Undocumented | Prompt-driven, no contract | Full prompt control | Prompt-driven | ~$0.002 |

## WER evidence

- Whisper large-v2, FLEURS Afrikaans: ≈34.1% WER (paper appendix,
  [arXiv:2212.04356](https://arxiv.org/pdf/2212.04356)); Zulu/Xhosa/Sotho/Tswana absent from
  Whisper's set entirely.
- ElevenLabs Scribe published tiers: Afrikaans 10–20%; Zulu/Xhosa/Northern Sotho 25–50%; English
  ≤5% — the only per-language WER bands covering Nguni/Sotho languages, and even the vendor's own
  numbers say Bantu-language transcripts need real human correction.
- No provider publishes en-ZA-accent-specific WER; Azure is the only one with a dedicated en-ZA
  model.

## Tuning approach for the correction-diff loop

Two layers, with the LLM layer as the primary tuning surface:

1. **Native keyterm biasing (recall layer).** Feed the top proper nouns — driver names, farm
   names, machine/implement terms — as Scribe keyterms (or, on the OpenAI fallback, a
   comma-separated glossary inside the 224-token whisper `prompt`, rotated). Rank terms by recent
   correction-diff frequency: when a user edit replaces ASR output X with vocabulary term Y, bump
   Y; evict cold terms. This is the only layer that can rescue words the ASR would otherwise never
   emit. Provider docs warn against large generic lists (overcorrection) — keep it to genuinely
   confusable local terms.
2. **Post-ASR LLM correction pass (precision + style layer).** Send the raw transcript to the LLM
   already wired in `pkg/ai` with the vocabulary registry, machine context, and a rotating set of
   real correction diffs as few-shot examples. This handles what native biasing can't:
   code-switch normalization, filler cleanup on providers without a switch, casing/spelling of
   names the ASR got phonetically close, unit/part formatting. It is provider-agnostic — the diff
   corpus survives an ASR vendor swap, which matters given market churn (Slam-1 deprecated within
   a year; gpt-4o-transcribe already "legacy"). Constrain the LLM to minimal-edit mode (risk:
   "correcting" a correct Afrikaans/Zulu passage into English) and store the raw ASR text for the
   diff.

**Practical wiring:** AI SDK `transcribe()` supports OpenAI, ElevenLabs, AssemblyAI, Deepgram,
Google Vertex with `providerOptions` pass-through — Scribe v2 primary + OpenAI fallback is a small
seam in the existing `pkg/ai` setup. All prices are noise at voice-note volume (a 1-minute note
costs $0.002–$0.017 everywhere); choose on language coverage and biasing, not cost. Avoid
streaming APIs — notes are recorded then uploaded.
