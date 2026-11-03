# Fase 6 — Manual proof 4: physical acoustic self-trigger / echo loop

Not automatable: this checks whether the GPT-Live full-duplex mic, hearing the
assistant's OWN voice through a real speaker, falsely interprets it as a new
user turn. Fake-mic WAV injection (used for proofs 1-3) bypasses the
microphone/speaker acoustic path entirely, so it cannot exercise this.

## Prerequisites
- Real speakers (not headphones) and a real microphone, in a normal room —
  the point is airborne sound actually reaching the mic.
- Dev server running (`npm run dev` or already up at `http://localhost:4173`).
- `OPENAI_API_KEY` configured (`npm run doctor` shows `[OK] OpenAI voice`).
- Browser tab focused, mic permission granted when prompted.

## Steps
1. Open the app, click the backend pill (`GPT`) once to switch to `GPT-LIVE`.
2. Click the mic button to start the session. Confirm status reads
   `LISTENING`.
3. Say one short command out loud, e.g. "Turn on the ships layer," then stop
   talking and stay silent.
4. While the assistant speaks its spoken reply through the speakers, watch
   the voice status/detail text:
   - **FAIL** if status flips to `EXECUTING`/`LISTENING` again and a *new*
     transcript line appears that was not something you said — the mic heard
     the speaker output and treated it as a fresh user turn.
   - **PASS** if status returns to idle/`LISTENING` quietly after the
     assistant finishes, with no new transcript attributed to you.
5. Repeat step 3-4 with the assistant giving a LONGER reply (ask something
   that prompts a multi-sentence answer, e.g. "What can you do?") — longer
   TTS playback is more likely to trip a self-trigger than a short "OK."
6. Stay completely silent for 30 seconds after the assistant finishes
   speaking. **FAIL** if the assistant starts talking again unprompted
   (confirms a self-trigger loop with no escape); **PASS** if it stays
   `LISTENING` and silent.
7. Stop the session (click the mic button again). Confirm status returns to
   `OFF` and the browser's mic indicator (tab/OS icon) turns off.

## Reporting back
For each of steps 4, 5, 6: note PASS or FAIL and, on FAIL, paste the exact
unexpected transcript text that appeared. No API key or other secret should
appear in anything you report back.
