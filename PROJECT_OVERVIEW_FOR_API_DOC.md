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
- **External API** (built and revised this session — the original design was
  synchronous; it was reworked to an async job API before sending anything,
  per review feedback that a long call holding a connection open was fragile):
  - `POST /api/external/v1/calls` — submit a call, returns `202` immediately
    with a `callId` (does not wait for processing).
  - `GET /api/external/v1/calls/{callId}` — poll for status/progress/result.
  - Auth: `X-API-Key` header, partner keys configured via
    `EXTERNAL_API_KEYS` env var (format `partner:key,partner2:key2`).
  - Request body: raw WAV audio, **mono, 8kHz, 16-bit PCM**. This is the exact
    format our real call recordings use, and the audio is never resampled
    anywhere in the pipeline — the model is fed exactly what's uploaded. An
    earlier draft of this file and the validator incorrectly said 16kHz; that
    was wrong and has been fixed in code and in the doc.
  - Response (while processing or complete): `{ callId, status, durationSec,
    progress, chunks: [{ tSec, anger, happy, neutral, sad }, ...], error }`.
    `chunks` fills in progressively while `status` is `processing`.
  - Optional `X-Callback-Url` header: on completion/failure, we POST the
    final result to that URL, signed with `X-Signature: sha256=<hmac>` (HMAC
    over the raw JSON body, using the partner's own API key as the secret).
    Delivery retries up to 3 times with backoff; never retried indefinitely,
    never blocks job processing.
  - Jobs are stored in the `call_jobs` table in RDS, **including the pending
    audio** (as `BYTEA`) until the job completes or fails, at which point the
    audio is cleared immediately (not held for the full 7-day retention
    period — only the result/metadata is kept that long).
  - On server startup, any job left `queued`/`processing` from before a
    restart is automatically re-queued (`resumeUnfinishedJobs`) — this was
    tested for real: killed the server mid-job, restarted it, confirmed it
    logged "Resuming 1 unfinished call job(s)" and completed correctly.
  - Internally, it chunks the audio into 3-second pieces, batches 3 chunks
    per SageMaker request, and processes up to **2 batches concurrently**
    per job (see test results below for why 2, not 3). Jobs themselves are
    processed one at a time, in submission order, by a single in-process
    worker — not multiple jobs' batches running concurrently against each
    other, which would exceed the proven-safe concurrency ceiling.
  - Code: `server/src/routes/external.ts`,
    `server/src/middleware/apiKeyAuth.ts`,
    `server/src/external/jobStore.ts`, `server/src/external/jobQueue.ts`,
    `server/src/external/webhook.ts`,
    `server/src/real-data/buildRealCall.ts`.

## What's been tested, and the real numbers

1. **Batch/post-call processing, realistic length**: a combined real
   sample call of ~4.6 minutes (274 seconds) was processed in **247.9
   seconds**, with no errors, using 2 concurrent batches. This gives a
   rule of thumb: **processing time is roughly equal to call length**
   (~0.9x call duration in this test). This number was measured against
   real 8kHz call audio throughout (the chunking code always read the
   actual sample rate from each file's header, never assumed 16kHz — only
   the separate format *validator*, added afterward, briefly had the wrong
   number), so this figure is not affected by that bug and still holds.
   This is the honest number to put in the doc — it is not instant, and
   should not be implied to be.
2. **Why concurrency is capped at 2, not 3**: with 3 concurrent batches,
   the SageMaker endpoint returned a timeout error
   (`ModelError: ... invocation timed out while waiting for a response
   from container primary`). With 2 concurrent batches, the same test
   passed cleanly with no errors, on both a short (~1 min) and the ~4.6 min
   sample. So 2 is the current safe concurrency limit, not an arbitrary
   choice.
3. **Error handling**: every error uses the shape `{ error: { code,
   message } }`. Confirmed codes: `missing_api_key`/`invalid_api_key` (401),
   `invalid_content_type`/`invalid_audio_format` (400), `payload_too_large`
   (413), `too_many_queued_jobs` (429, >5 queued/processing per partner),
   `unknown_call_id` (404), `internal_error` (500).
4. **Full end-to-end flow tested live** (not just type-checked): submit →
   poll mid-processing (confirmed real partial chunks + progress) →
   complete → webhook fired with a verified valid HMAC signature. Also
   tested the crash-resume path for real (see above). This was tested
   against a locally-run server connected to the real RDS database and the
   real SageMaker endpoint — **not yet tested against the actual deployed
   Render URL** after pushing. That's a remaining step before this is fully
   verified in production, since Render's own request timeout, upload size
   handling, and RDS latency from Render's network aren't exercised by a
   local test.

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

1. Overview — what the API does, who it's for, that it's recorded calls
   only (not live).
2. Authentication — `X-API-Key` header, how we issue/rotate keys.
3. Submit endpoint — `POST /v1/calls`, exact request format (8kHz mono
   16-bit WAV — state this precisely, not "16kHz" and not vaguely "any
   format, we resample" since we don't resample anything), optional
   `X-Callback-Url`, the `202` response shape.
4. Poll endpoint — `GET /v1/calls/{callId}`, the full response shape
   including `progress` and partial `chunks` while processing.
5. Webhook — signing scheme, retry behavior, when it fires.
6. Error responses — the real codes/meanings listed above, consistent
   shape.
7. Limits & current scope — max file size (50MB), max 5 queued jobs per
   partner, **recorded calls only, not live/real-time** (state this
   plainly, don't bury it), realistic turnaround time (~1x call duration),
   7-day result retention.
8. Support contact.

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
- [ ] Does the doc state the accepted audio format exactly as 8kHz mono
      16-bit PCM, with no ambiguity about whether resampling happens
      (it doesn't)?
- [ ] Does it describe the actual async flow (submit → `202` → poll/webhook),
      not the old synchronous design?
