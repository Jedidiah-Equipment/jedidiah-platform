# Glossary Map

This platform serves two businesses under one owner, as two bounded contexts (ADR 0016):

- **Jedidiah Equipment** — glossary in [GLOSSARY-EQUIPMENT.md](GLOSSARY-EQUIPMENT.md).
- **Jedidiah Contracting** — glossary in [GLOSSARY-CONTRACTING.md](GLOSSARY-CONTRACTING.md).

An unqualified term means the context you are standing in. Crossing contexts, qualify it:
**Equipment Job** / **Contracting Job**. The two contexts deliberately reuse ordinary words (Job,
Customer) for different concepts; never treat a same-named term as shared.

## Shared concepts

- **User** is one person (or Device Account) across both businesses, holding up to two role
  slots — an Equipment role and a Contracting role. **Business access is role presence**: a user
  sees a context's surfaces only while holding a role in it, and only users with both slots
  filled see the mode switcher. **super-admin** is the one role above the split: everything in
  both businesses plus user administration, filling both slots by definition, and still the only
  role that mints another super-admin.
- There is **no data crossing between the two business contexts**: a Contracting Machine holds no
  reference to an Equipment Product Unit (a machine Jedidiah Equipment built is still just a
  Machine on the contracting side), and Customers are not shared — each business keeps its own
  directory, and the same real-world farmer may appear in both.
- **Audit Event** is one mechanism serving both businesses, read as one **Audit Log per business**:
  each business's log shows the events for its own entity types and opens only to that business's
  audit read permission. A User event belongs to exactly one log: Contracting's when the User holds a
  Contracting role and no Equipment role, Equipment's otherwise (a super-admin's, a role-less or
  removed User's), because most audited User facts are Equipment ones — Department Membership, the
  shared device flag, the Activity View map, the muted Push Kinds. The business is
  derived on read, so the log stores none of its own — and a User who moves wholly to the other
  business takes their event history with them.
- **Activity View** is one User fact holding one mark per business: Equipment's Job Activity and
  Contracting's Activity each advance and read their own, so catching up in one business never clears
  the other's unread badge. A business with no mark yet reads from the account's creation.
- **Push Kind** is one kind of push notification the platform can send, owned by one business, with the
  roles it can reach; today every kind is Contracting's. Role membership decides who a kind can reach
  and who the phone asks for notification permission; a User may **mute** any kind that can reach them
  in App Settings, which stops that kind's pushes to them and nothing else — badges, feeds and the
  Dashboard are untouched.
- **Voice Note** is a recording a user makes into a multi-line text field of the mobile app to fill it
  by speech instead of typing; the field receives editable text in the language spoken, and the
  recording itself is never kept. Available only while online; the web app is typed-only. Each
  business decides which of its fields take one. _Avoid_: dictation, audio note, voice memo.
- **Transcription** is one Voice Note turned into text, kept in the business it was spoken in: the raw
  text the speech service heard, the tidied text the user was shown, the detected language, and — once
  the user saves the field — the text they kept where its tidied text was inserted, not the whole
  field: typed text and other Voice Notes in the same field are not part of it, deleting the inserted
  text keeps nothing, and an insert the field's limit cut short reports nothing. The tidied text is a
  minimal edit of the raw text and is never a translation. _Avoid_: transcript (bare), correction diff.
- **Transcription Hint** is one short rule about one thing, distilled from one correction in a
  Transcription whose saved text differs from the shown text — how a name is spelled, what a local word
  means — kept so the same business's future Transcriptions apply it. Each business has its own pool of
  at most 100 hints in force, and nothing one business learns reaches the other. A Transcription teaches
  at most three hints, one per distinct reusable correction, each with at most one keyterm and retired
  on its own. Derived only when the user corrected rather than rewrote, and only from English
  Transcriptions for now; applied to Transcriptions in every language. _Avoid_: rule, correction,
  vocabulary entry.
- **Keyterm** is one proper noun the speech service is told to expect, sent with every Voice Note as a
  list: the business's taught hint keyterms first, then the vocabulary its **Transcription Profile**
  names, cut only past a fixed count. _Avoid_: keyword, vocabulary.
- **Transcription Profile** is what one business brings to the shared Voice Note pipeline: the sentence
  saying where its notes are spoken, which opens the tidy prompt, and the sources of its Keyterms.
  Who may record and who may review is each business's own `<business>_transcription:use` and
  `:read`. See ADR 0024.
- **App Settings** is the phone's own settings page, reached from the profile menu in either business:
  the OS permissions the app uses (notifications, camera, microphone, location, photos) with a way to
  ask or to open the phone's settings, and the mute toggles for the Push Kinds that can reach the
  signed-in User. It belongs to neither business. It is **not** Contracting's **Settings**, the one web
  row of Contracting-wide thresholds; that collision is deliberate on the phone's menu label only.
