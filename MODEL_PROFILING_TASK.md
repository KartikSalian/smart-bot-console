# SERTS model: profiling task (GPU vs CPU decision)

## Context

During live two-person calls, the model falls behind: each audio chunk is
3 seconds long, but round-trip processing of a chunk takes close to 3
seconds too. Since a new chunk arrives every 3 seconds regardless, there's
no safety margin — any slowdown (multiple live calls at once, a slightly
slower chunk) causes a growing backlog.

We've already fixed the parts of this we can fix from the **infrastructure**
side (more SageMaker instances, concurrent request handling on the client).
What's left is a question only the **model's own code** can answer:

> Is the ~3s-per-chunk time dominated by actual model inference (the neural
> net doing its forward pass), or by something else around it (audio
> loading/preprocessing, feature extraction, postprocessing)?

This matters because Declan is weighing whether to move to a bigger/faster
GPU for the production endpoint — that costs more per month, and it's only
worth doing if the bottleneck is actually the inference step itself. If the
time is mostly spent in preprocessing/postprocessing instead, a faster GPU
won't fix it — that code would need optimizing instead.

## What we need from this

A simple breakdown of where the ~3 seconds per chunk actually goes, e.g.:

1. Loading/decoding the audio chunk
2. Feature extraction / preprocessing (whatever happens before it hits the model)
3. The actual model inference (forward pass)
4. Postprocessing / formatting the output

(Use whatever the real stages in the code actually are — the above is a
guess at the likely shape, not a given. The point is: wrap each real stage
with a timer and log how long each one takes, for a representative chunk.)

## How to reproduce it

1. Clone the model repo:
   ```
   git clone https://gitlab.com/NimbusDev/serts-handover/serts.git
   ```
2. Run it locally (on your device) exactly as it would run in the
   SageMaker container — same entrypoint, same inference code path that
   SageMaker actually calls per request.
3. Feed it a single real audio chunk (3 seconds, 16kHz mono WAV) as input —
   same shape of input the live endpoint receives today (see below).
4. Add basic timing (`time.time()` / `time.perf_counter()` in Python, or
   whatever's idiomatic for however the repo is written) around each real
   stage in the code, and log/print each stage's duration separately,
   plus the total.
5. Run it a few times (5-10 runs) to get a stable average per stage —
   first-run timing is often misleading (model/weights loading, cold
   start), so ignore run #1 or warm up first.

## Exact input format the live endpoint receives

This is what our server actually sends to the deployed SageMaker endpoint
today, so testing against the same shape is important for the numbers to
be meaningful:

```json
{
  "invocations": {
    "<uid>": "<base64-encoded WAV audio, one 3-second chunk>"
  }
}
```

- Audio chunks are raw WAV, mono, 16kHz (matches what the endpoint already
  expects in production).
- In production we usually batch 2-3 chunks per request (multiple `uid`
  keys in one `invocations` object), but for this profiling task, testing
  with a single chunk is fine and simpler — we care about per-chunk
  processing time, not batching behavior.
- Expected output shape (for reference, not required for profiling):
  ```json
  {
    "predictions": [
      {
        "uid": "<uid>",
        "predicted_class": 0,
        "predicted_label": "neutral",
        "probabilities": { "anger": 0.02, "happy": 0.02, "neutral": 0.79, "sad": 0.17 }
      }
    ]
  }
  ```

## What to report back

For a representative 3-second chunk, on your device:

- Time spent in each stage (in milliseconds), individually
- Total time
- Whether these numbers were CPU-only or whether your device has a GPU it
  used (note which, since that affects how to interpret the numbers)
- Whether the bottleneck stage is consistent across multiple runs, or
  varies a lot

## Why this decides the GPU question

- **If inference (the model forward pass) dominates** → a bigger/faster
  GPU in production should meaningfully cut the ~3s-per-chunk time, and is
  worth the extra monthly cost.
- **If preprocessing/postprocessing dominates instead** → a faster GPU
  won't help much, since that code likely runs on CPU regardless — the fix
  would be optimizing that code path instead, not better hardware.

Once we have this breakdown, Kartik will take it back to Declan to decide
whether to move the production endpoint to a larger GPU instance type.
