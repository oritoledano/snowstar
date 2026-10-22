# The Audioctor films (media/audioctor/song.mp4, video.mp4)

Two films of the app at work, made from real material: **the picture is the app's own page, and the sound is what
the engine itself produced** from Ori's own files. Nothing in them is drawn by hand except the mouse pointer and
the card being dragged in.

| Film | What it shows | Source file |
|---|---|---|
| `song.mp4` (20 s) | a finished master taken apart into six parts, the voice soloed, then pulled out of the mix | `KAYMA/NEW TRYING OUTS (ALBUM)/… On Site Lover … 44_24.wav` |
| `video.mp4` (14.3 s) | a phone video of a gig split into voice, music and background; before/after, the singer alone, the crowd alone | `KAYMA/CONTENT/2024-11-14 08.16.06.mov` |

## How they are made

1. **The engine runs for real** (SNOWSTAR-ENHANCE's `AudioctorCli`), writing one stereo file per part:

   ```
   AudioctorCli enhance FILE -o DIR --parts instruments --quality best      # the song
   AudioctorCli enhance FILE -o DIR --quality best                         # the video
   ```

   Its `report.json` gives the film its true numbers: the chain, the steps and their seconds, the detected mode,
   the bandwidth, and which parts the app hides (`Keys (hidden)` in the song).

2. **`audio.py`** mixes those parts exactly as the app's faders mix them — the spec's levels, ramps, solos and the
   BEFORE/AFTER switch — and writes `<id>-audio.wav` plus `<id>-film.json`: the timeline, the waveform peaks for
   the scope, and one meter frame every 50 ms. The meters you see are the sound you hear, from the same numbers.

3. **`film.js`** loads the app's own window (`SNOWSTAR-ENHANCE/app/ui/index.html`, **as it ships** — the page is not
   edited, it is spoken to through its own event bus), injects `scene.js` with that JSON, films it in headless
   Chrome and muxes the sound. It drops the frames taken before the scene started, so picture and sound share one
   zero.

   ```
   ~/.cache/snowstar-enhance/venv/bin/python audio.py          # both films' sound
   node film.js song      # -> audioctor-song.mp4 + .jpg
   node film.js video
   node film.js song --still 5   # one frame, to check a change
   ```

   Then copy them to `media/audioctor/song.mp4|jpg`, `video.mp4|jpg` and bump the `?v=` on the page.

## When the app changes

Re-run step 3: the films follow the app's own CSS and markup, so a new look needs no new drawing. Re-run step 1
as well if the engine's output changed (different parts, different timings). The timings in `spec.json` are
compressed on purpose — the real run took 54 s and 6 s, and the films say so on the nixies.

**Don't edit anything in SNOWSTAR-ENHANCE from this repo** (the split: that session owns the app, this one owns the
site). `film.js` only reads its page.
