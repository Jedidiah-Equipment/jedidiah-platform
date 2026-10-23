# Transcription Is One Mechanism Across Both Businesses

A Voice Note turns speech into text in a mobile text field: the speech model hears it, a language model tidies it, and a correction the user saves teaches Transcription Hints for later notes. Contracting built it first, entirely inside its own folders, tables and permissions. Equipment needs the same pipeline with its own vocabulary. We decided that **Transcription is one business-blind mechanism in `public`**, the way the Audit Event is: one `transcription` and one `transcription_hint` table, each row keyed by the `business` it was spoken in; one upload route per business path and one tRPC router whose review reads name the business, each opened by that business's `<business>_transcription:use` / `:read` permission; one engine and one hint derivation queue. Saving what a form kept names no business: only the person who recorded a Transcription may save it, and recording it already took that business's `use`.

What differs between businesses is supplied by one **Transcription Profile** per business, exported from its core entrypoint: the sentence that says where its notes are spoken, which opens the tidy prompt, and a loader of the proper nouns its speech model should expect. `server.ts` composes the two profiles into the shared wiring, so no shared module names a business. Each business keeps its own hint pool under the same caps; nothing learned in one business reaches the other.

## Considered Options

- **Per-business tables and routers over a generic core.** Rejected. Two routers, two upload routes and two wirings would have to stay in step, and the generic core would have to take each business's Drizzle tables through a structural adapter. Every rule about saving, deriving and retiring hints is the same in both businesses, so a second copy could only drift.
- **One hint pool shared across the wall.** Rejected. The businesses share no data (ADR 0016); a correction about a Contracting Farm would bias Equipment's notes, and one business's corrections could crowd out the other's under the cap.

## Consequences

- Giving another business, or another text field, Voice Notes is a profile, two permissions and a nav entry, not a new pipeline.
- Transcription joins the Audit Event and the Changelog View as business-blind mechanism in `public`, keyed by `business` on every row.
- The tables moved from the `contracting` schema with their rows; every row before the move is `contracting`. ADR 0016's exit grades apply row by row through `business`.
- Phones from before the move post to `/api/contracting/transcriptions` and call `contractingTranscriptions.saved`. Because the save names no business, that alias is the shared save procedure under its old name; both aliases go with #1804.
