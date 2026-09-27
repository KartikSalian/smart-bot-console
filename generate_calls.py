#!/usr/bin/env python3
"""Generates synthetic SERTS+LLM call records matching the Smartbot Console schema.

Usage: python generate_calls.py --n 12 [--out sample_data/calls.json] [--seed 42]

Output is entirely synthetic. It is shaped to match the real SERTS+LLM pipeline's
output schema so the live feed can swap in later without UI changes.
"""
import argparse
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

CATEGORIES = ["Billing", "Access", "Complaint", "Product", "Cancellation", "Fraud", "Other"]
ISSUE_STATUSES = ["resolved", "unresolved", "escalated"]
EMOTIONS = ["anger", "happy", "neutral", "sad"]

AGENTS = [
    ("ag-01", "Niamh D.", "Script A"),
    ("ag-02", "Callum R.", "Script B"),
    ("ag-03", "Priya S.", "Script A"),
    ("ag-04", "Declan M.", "Script C"),
    ("ag-05", "Fatima K.", "Script B"),
]

REASON_TEMPLATES = {
    "Billing": "Query a recent charge on the account",
    "Access": "Access a deceased partner's pension account",
    "Complaint": "Raise a complaint about a previous call",
    "Product": "Ask about switching pension products",
    "Cancellation": "Cancel a policy",
    "Fraud": "Report a suspicious transaction",
    "Other": "General account query",
}

QUESTION_TEMPLATES = [
    "Can you confirm the current balance?",
    "What documents do I need to provide?",
    "How long will this take to process?",
    "Is there a fee for this request?",
    "Who can I speak to about this further?",
]

ACTION_TEMPLATES = [
    "Verified customer identity",
    "Updated contact details on file",
    "Submitted the request for processing",
    "Sent confirmation email to the customer",
    "Escalated the request to the specialist team",
]

CUSTOMER_LINES = [
    "I've been trying to sort this out for weeks now.",
    "Okay, that makes sense, thank you.",
    "I'm really not happy about how long this has taken.",
    "Can you just tell me what I need to do next?",
    "This is quite upsetting, it was my husband's account.",
    "Right, I understand.",
    "Is that really the only option I have?",
    "Thank you for your help with this.",
]

AGENT_LINES = [
    "I completely understand, let me look into that for you.",
    "Thanks for confirming, give me one moment.",
    "I'm sorry to hear that, let's get this sorted.",
    "I can see the account here, one second.",
    "You'll need to provide proof of identity for this.",
    "I've made a note of that for you.",
    "Let me check what options are available.",
]


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def normalize(d: dict) -> dict:
    total = sum(d.values())
    return {k: round(v / total, 3) for k, v in d.items()}


def make_series(rng: random.Random, duration_sec: int, arc: str):
    """arc: 'calm', 'escalating', 'recovering', 'volatile' - shapes the emotion trajectory."""
    n_chunks = max(4, duration_sec // 3)
    series = []
    sad, anger, happy = 0.1, 0.1, 0.2

    for i in range(n_chunks):
        progress = i / max(1, n_chunks - 1)
        if arc == "calm":
            sad = clamp01(0.1 + rng.uniform(-0.05, 0.05))
            anger = clamp01(0.05 + rng.uniform(-0.03, 0.05))
            happy = clamp01(0.3 + rng.uniform(-0.05, 0.1))
        elif arc == "escalating":
            sad = clamp01(0.15 + 0.55 * progress + rng.uniform(-0.05, 0.05))
            anger = clamp01(0.1 + 0.3 * progress + rng.uniform(-0.05, 0.08))
            happy = clamp01(0.25 - 0.2 * progress + rng.uniform(-0.05, 0.05))
        elif arc == "recovering":
            dip = 4 * progress * (1 - progress)
            sad = clamp01(0.15 + 0.35 * dip + rng.uniform(-0.05, 0.05))
            anger = clamp01(0.1 + 0.15 * dip + rng.uniform(-0.03, 0.05))
            happy = clamp01(0.2 + 0.3 * (1 - dip) + rng.uniform(-0.05, 0.1))
        else:  # volatile
            sad = clamp01(0.2 + 0.3 * abs(rng.uniform(-1, 1)))
            anger = clamp01(0.15 + 0.3 * abs(rng.uniform(-1, 1)))
            happy = clamp01(0.15 + rng.uniform(-0.1, 0.2))

        neutral = clamp01(1.0 - sad - anger - happy)
        if neutral < 0.05:
            neutral = 0.05
        probs = normalize({"anger": anger, "happy": happy, "neutral": neutral, "sad": sad})
        series.append({"tSec": i * 3, **probs})

    return series


def scalar_sentiment(chunk: dict) -> float:
    return chunk["happy"] - (0.7 * chunk["sad"] + 1.0 * chunk["anger"])


def build_call(rng: random.Random, idx: int, base_time: datetime) -> dict:
    call_id = f"C-{48000 + idx}"
    agent_id, agent_name, script = rng.choice(AGENTS)
    category = rng.choice(CATEGORIES)
    duration_sec = rng.randint(180, 720)
    arc = rng.choices(
        ["calm", "escalating", "recovering", "volatile"],
        weights=[0.4, 0.25, 0.2, 0.15],
    )[0]

    series = make_series(rng, duration_sec, arc)
    start_mean = sum(scalar_sentiment(c) for c in series[:3]) / min(3, len(series))
    end_mean = sum(scalar_sentiment(c) for c in series[-3:]) / min(3, len(series))
    delta = end_mean - start_mean

    dominant_totals = {e: sum(c[e] for c in series) for e in EMOTIONS}
    dominant = max(dominant_totals, key=dominant_totals.get)

    # vulnerability: sustained mean sad >= 0.55 over 10 chunks (30s)
    vulnerability = False
    vulnerability_reason = None
    window = 10
    for i in range(window - 1, len(series)):
        chunk_window = series[i - window + 1 : i + 1]
        mean_sad = sum(c["sad"] for c in chunk_window) / window
        if mean_sad >= 0.55:
            vulnerability = True
            vulnerability_reason = f"Sustained sadness (>0.55 for 30s at {chunk_window[0]['tSec']}s)"
            break

    n_questions = rng.randint(1, 3)
    n_actions = rng.randint(1, 3)
    questions = []
    for _ in range(n_questions):
        t = rng.randint(10, max(11, duration_sec - 20))
        questions.append(
            {
                "text": rng.choice(QUESTION_TEMPLATES),
                "transcript_ref": {"startSec": t, "endSec": t + rng.randint(4, 10)},
            }
        )
    actions = []
    for _ in range(n_actions):
        t = rng.randint(30, max(31, duration_sec - 10))
        actions.append(
            {
                "text": rng.choice(ACTION_TEMPLATES),
                "transcript_ref": {"startSec": t, "endSec": t + rng.randint(4, 10)},
            }
        )

    issue_status = rng.choices(ISSUE_STATUSES, weights=[0.5, 0.3, 0.2])[0]
    issue_t = rng.randint(duration_sec // 2, max(duration_sec // 2 + 1, duration_sec - 10))
    issues = [
        {
            "category": category,
            "status": issue_status,
            "transcript_ref": {"startSec": issue_t, "endSec": issue_t + 8},
        }
    ]

    confidence_overall = round(rng.uniform(0.55, 0.98), 2)
    low_conf_fields = []
    if confidence_overall < 0.7:
        low_conf_fields = rng.sample(["call_reason", "issues[0].status", "sentiment_trajectory.dominantEmotion"], k=1)
    needs_review = confidence_overall < 0.65 or vulnerability

    transcript = []
    n_lines = max(6, duration_sec // 20)
    for i in range(n_lines):
        t = int(i * duration_sec / n_lines)
        speaker = "customer" if i % 2 == 0 else "agent"
        text = rng.choice(CUSTOMER_LINES if speaker == "customer" else AGENT_LINES)
        transcript.append({"tSec": t, "speaker": speaker, "text": text})

    started_at = base_time + timedelta(minutes=idx * 7, seconds=rng.randint(0, 59))

    return {
        "callId": call_id,
        "platform": "amazon_connect",
        "startedAt": started_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "durationSec": duration_sec,
        "agent": {"id": agent_id, "name": agent_name, "script": script},
        "customerRef": f"CUST-{rng.randint(1000, 9999)}",
        "call_reason": {"category": category, "statedReason": REASON_TEMPLATES[category]},
        "questions_asked": questions,
        "actions_completed": actions,
        "issues": issues,
        "sentiment_trajectory": {
            "start": round(start_mean, 2),
            "end": round(end_mean, 2),
            "delta": round(delta, 2),
            "dominantEmotion": dominant,
            "series": series,
        },
        "compliance_flags": {
            "vulnerability": vulnerability,
            "vulnerability_reason": vulnerability_reason,
            "repeat_contact": rng.random() < 0.15,
        },
        "confidence": {
            "overall": confidence_overall,
            "low_confidence_fields": low_conf_fields,
            "needs_review": needs_review,
        },
        "transcript": transcript,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n", type=int, default=12, help="Number of calls to generate")
    parser.add_argument("--out", type=str, default="sample_data/calls.json", help="Output JSON path")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    base_time = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) - timedelta(hours=3)

    calls = [build_call(rng, i, base_time) for i in range(args.n)]

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(calls, indent=2), encoding="utf-8")
    print(f"Wrote {len(calls)} synthetic calls to {out_path}")


if __name__ == "__main__":
    main()
