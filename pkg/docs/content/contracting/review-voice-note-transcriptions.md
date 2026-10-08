# Review Voice Note Transcriptions

The Transcriptions page shows what each Voice Note was turned into, the Transcription Hints learned from
people's corrections, and what the models are asked. It is read-only.

## Steps

1. Open **Transcriptions** under **Admin**.
2. On **Transcriptions**, the newest Voice Note appears first. Each row shows:
   - who recorded it and when;
   - what the field was for, and the language detected;
   - what was **Heard**, what was **Shown**, and what was **Kept**.
3. Read **Kept** to see the correction. Words the person removed are struck through; words they added are
   highlighted. Kept is only that Voice Note's part of the field, not anything typed around it.
4. Read **Hint** to see what the correction led to:
   - **Not saved yet**: the form holding the Voice Note was never saved.
   - **No correction**: the person kept the text as shown, or deleted it.
   - **Not English, so skipped**: hints are learned from English Voice Notes only.
   - **Pending**: the correction is waiting to be read.
   - **Hint added**: choose **View the hint** to jump to it.
   - **No hint**: the correction taught nothing reusable; the reason is shown below it.
5. Open **Hints** to see every Transcription Hint, those in force first. The line above the table counts
   the hints in force against the limit. Each hint shows:
   - its rule and keyterm;
   - when it was added, and when it was retired;
   - the hint that replaced it, if any;
   - the correction it was **Learned from**.
6. Open **Prompts** to see the three model requests as they would be sent now, with the model each uses.
   The highlighted parts in double braces are filled from each Voice Note. Under **Speech-to-text**, **Keyterms cut
   off** lists the names that did not fit in the prompt, with where each came from.

The Transcriptions page is available to a Contracting Administrator and a Super Administrator, because it
shows every user's Voice Note text.
