# Smartbot Call Analysis API — v1 (Recorded Calls)

## Overview

This API analyzes a recorded call and returns emotion scores (anger,
happy, neutral, sad) over time. Submit a call's audio, then poll for the
result or receive it via a webhook once processing completes.

**This API covers recorded/post-call audio only.** Live, real-time
analysis during an in-progress call is in active development and not yet
available — there is no committed date for it yet. Using this API,
submitting a call recording as soon as it ends is fully supported today.

## Authentication

Every request requires an API key, provided to you separately, sent as a
header:

```
X-API-Key: <your key>
```

Requests without a valid key return `401`.

## 1. Submit a call

```
POST /api/external/v1/calls
X-API-Key: <your key>
Content-Type: audio/wav
X-Callback-Url: https://your-server/webhook   (optional)

Body: raw WAV audio — mono, 8kHz, 16-bit PCM, max 50MB
```

Validation happens immediately on upload — if the file isn't in the
expected format, you get a `400` back within about a second, not after
the job has been queued.

**Response — `202 Accepted`:**
```json
{ "callId": "call_8f3a1c2e9b7d4f61", "status": "queued", "durationSec": 274.4 }
```

## 2. Check status / get the result

```
GET /api/external/v1/calls/{callId}
X-API-Key: <your key>
```

**Response:**
```json
{
  "callId": "call_8f3a1c2e9b7d4f61",
  "status": "processing",
  "durationSec": 274.4,
  "progress": 0.42,
  "chunks": [
    { "tSec": 0, "anger": 0.05, "happy": 0.10, "neutral": 0.80, "sad": 0.05 },
    { "tSec": 3, "anger": 0.03, "happy": 0.02, "neutral": 0.55, "sad": 0.40 }
  ],
  "error": null
}
```

- `status` is one of `queued`, `processing`, `completed`, `failed`.
- `chunks` fills in progressively while `status` is `processing` — you
  don't need to wait for `completed` to start rendering a graph.
- Each chunk covers a 3-second window of the call, starting at `tSec`.
- When `status` is `failed`, `error` contains a short message; `chunks`
  will contain whatever was completed before the failure.

## 3. Webhook (optional, recommended)

If you included `X-Callback-Url` when submitting the call, we POST the
final result to that URL once the job reaches `completed` or `failed`:

```json
{
  "callId": "call_8f3a1c2e9b7d4f61",
  "status": "completed",
  "durationSec": 274.4,
  "chunks": [ ... ],
  "error": null
}
```

The request includes a signature header so you can verify it came from
us:

```
X-Signature: sha256=<hmac>
```

The HMAC is computed over the raw JSON body using your API key as the
signing secret (SHA-256). Verify it before trusting the payload.

If your endpoint is unreachable or returns a non-2xx response, we log it
but do not retry — poll `GET /v1/calls/{callId}` as a fallback if you
rely on the webhook and suspect a delivery issue.

## Errors

All errors use one consistent shape:

```json
{ "error": { "code": "invalid_audio_format", "message": "Expected mono 8kHz WAV" } }
```

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_content_type` | `Content-Type` header wasn't `audio/wav` |
| 400 | `invalid_audio_format` | File isn't valid mono/8kHz/16-bit WAV |
| 401 | `missing_api_key` | No `X-API-Key` header sent |
| 401 | `invalid_api_key` | `X-API-Key` doesn't match a known key |
| 404 | `unknown_call_id` | No job exists with that `callId` for your key |
| 413 | `payload_too_large` | File exceeds the 50MB limit |
| 429 | `too_many_queued_jobs` | More than 5 jobs already queued/processing for your key |
| 500 / 502 | `internal_error` | Something failed on our end — safe to retry |

## Limits & current scope

- **Recorded calls only.** No live/streaming support yet.
- Max file size: 50MB per call.
- Max 5 jobs queued/processing at once per API key — submit more once
  earlier ones complete.
- **Processing time is roughly equal to the call's length.** In testing,
  a 274-second (~4.6 minute) call took about 248 seconds to fully
  process. Longer calls take proportionally longer; this is not
  instantaneous, and progress should be shown as the job works through
  the call.
- Results are retained for 7 days after completion, then deleted.

## Support

For integration issues or questions, contact Kartik Salian directly.
