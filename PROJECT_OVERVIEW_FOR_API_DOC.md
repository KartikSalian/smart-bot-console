# Project overview — for supervising the CX Assist API documentation

## Your role

You are acting as a supervisor/reviewer for a specific deliverable: a
professional API documentation file for an external partner (CX Assist),
describing our post-call/batch emotion-analysis endpoint. Another Claude
session (or Kartik directly) will draft the doc; your job is to review it
against the ground truth in this file for accuracy, completeness, and
whether it reads like a real company's API documentation rather than an
internal scratch note. Do not invent details not confirmed below — if
something needed for the doc isn't in this file, flag it as missing rather
than guessing.

## What the product is

Smartbot Console: a dashboard and backend for Smartbot Software's SERTS
model — a speech-emotion AI model deployed on AWS SageMaker that scores
call audio for emotion (anger, happy, neutral, sad) over time. It was
originally built for internal use (an agent/supervisor dashboard reviewing
real contact-center calls), and is now being extended to serve external
partners via an API, starting with CX Assist (an AI-human hybrid VoIP
platform).

## Current architecture (ground truth)

- **Model**: SERTS, deployed as a live AWS SageMaker real-time endpoint
  (`smartbot-v2-model-endpoint`, region eu-west-2), instance type
  `ml.m5.large`.
- **Auto-scaling**: configured 1→3 instances, target-tracking policy based
  on invocations per instance. (Done to help with load, see below for what
  it did and didn't fix.)
- **Backend**: Node.js/Express (`server/` directory), TypeScript.
- **External API** (already built, this session): `POST
  /api/external/v1/calls/analyze`
  - Auth: `X-API-Key` header, partner keys configured via
    `EXTERNAL_API_KEYS` env var (format `partner:key,partner2:key2`).
  - Request body: raw WAV audio (mono, 16kHz), `Content-Type: audio/wav`.
  - Response: JSON `{ chunks: [{ tSec, anger, happy, neutral, sad }, ...] }`
    — one entry per 3-second chunk of the call.
  - This is **synchronous**: the client sends the whole call's audio, and
    the response is held until the full result is ready (no job-ID/polling
    pattern — decided deliberately, since Phase 1 with CX Assist is
    post-call/batch testing, not live streaming).
  - Internally, it chunks the audio into 3-second pieces, batches 3 chunks
    per SageMaker request, and processes up to **2 batches concurrently**
    (see test results below for why 2, not 3).
  - Code: `server/src/routes/external.ts`,
    `server/src/middleware/apiKeyAuth.ts`,
    `server/src/real-data/buildRealCall.ts`.

## What's been tested, and the real numbers

1. **Batch/post-call processing, realistic length**: a combined real
   sample call of ~4.6 minutes (274 seconds) was processed in **247.9
   seconds**, with no errors, using 2 concurrent batches. This gives a
   rule of thumb: **processing time is roughly equal to call length**
   (~0.9x call duration in this test). This is the honest number to put in
   the doc — it is not instant, and should not be implied to be.
2. **Why concurrency is capped at 2, not 3**: with 3 concurrent batches,
   the SageMaker endpoint returned a timeout error
   (`ModelError: ... invocation timed out while waiting for a response
   from container primary`). With 2 concurrent batches, the same test
   passed cleanly with no errors, on both a short (~1 min) and the ~4.6 min
   sample. So 2 is the current safe concurrency limit, not an arbitrary
   choice.
3. **Error handling**: the endpoint returns `401` for a missing/invalid API
   key, `400` for wrong content type, `413` if the body exceeds 50MB, and
   `502` if the underlying model call fails.

## What is explicitly NOT ready yet (do not let the doc imply otherwise)

- **Live/real-time calls are not production-ready.** A simulation test
  (2 simultaneous live calls, each sending a real 3-second chunk every 3
  seconds, matching the real live-call cadence) showed:
  - 1 call alone: fine, ~2.7-2.95s per chunk, under the 3s budget, no
    backlog.
  - 2 calls at once: average latency jumped to ~9.5s per chunk, growing
    every tick (backlog compounds, doesn't stabilize), peaking at 7
    requests queued simultaneously.
  - Root cause understood: each chunk's own processing time (~2.7-2.9s) is
    already close to the 3-second budget with zero load — there's almost
    no margin, so any concurrent load overwhelms it. This is not a fixed
    client-code problem (auto-scaling and concurrent batching are already
    in place) — it's that per-chunk latency itself needs to come down,
    which is a separate, ongoing investigation (profiling the model's
    internal stages to see if a GPU upgrade would help — tracked
    separately, not part of this doc).
  - **Decision made**: be upfront with CX Assist that live/real-time is
    in active development with no committed date yet, and offer the
    post-call/batch API now as what's ready today.

## What the API doc should actually contain

(This was already scoped in an earlier planning pass — repeating here so
the reviewer can check the draft against it.)

1. Overview — what the endpoint does, who it's for.
2. Authentication — `X-API-Key` header, how we issue/rotate keys.
3. Endpoint reference — method, URL, headers, request body format,
   response format (use the real JSON shapes above).
4. Example request (`curl`) and example response.
5. Error responses — the real codes/meanings listed above.
6. Limits & current scope — max file size (50MB), **this is post-call/batch
   only, not live/real-time** (state this plainly, don't bury it), and the
   realistic turnaround time (~1x call duration, based on the real test
   above — do not round this down to sound faster than it is).
7. Support contact.

## Review checklist for you (the supervisor)

- [ ] Does the doc state honestly that this is post-call/batch only, not
      live/real-time? (This must not be implied as "coming later" in a way
      that undersells it as already live.)
- [ ] Does it use the real tested numbers (processing ≈ call duration),
      not an optimistic guess?
- [ ] Does it match the actual request/response JSON shapes above exactly
      (field names, nesting)?
- [ ] Does it avoid promising a specific date for live/real-time support?
- [ ] Does it read like professional, external-facing documentation — no
      internal jargon, no mention of our internal AWS account details,
      instance types, or anything not relevant to an external integrator?
- [ ] Is anything stated that isn't backed by something in this file? If
      so, flag it rather than letting it pass.
