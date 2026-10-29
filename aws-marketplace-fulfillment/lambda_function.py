"""AWS Marketplace SaaS fulfilment landing endpoint.

AWS Marketplace POSTs a registration token (x-amzn-marketplace-token) to this
Lambda's Function URL when a buyer subscribes. We don't have the full
fulfilment flow (ResolveCustomer, entitlement checks) built yet, so for now
this just stores the token for later processing and redirects the buyer to
a page on smartbotsoftware.com where they can request setup.

Deliberately minimal: no ResolveCustomer call, no entitlement check, no SNS
handling yet. Those come later, once the real fulfilment flow is built —
this endpoint's only job today is "don't let the buyer hit a dead end, and
don't lose the token."
"""

import base64
import os
import time
from urllib.parse import parse_qs

import boto3

TABLE_NAME = os.environ.get("TABLE_NAME", "aws-mp-registrations")
REDIRECT_URL = "https://www.smartbotsoftware.com/#contact-us"

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def _redirect():
    return {
        "statusCode": 302,
        "headers": {"Location": REDIRECT_URL},
        "body": "",
    }


def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")

    if method != "POST":
        return _redirect()

    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")

    params = parse_qs(body)
    token_values = params.get("x-amzn-marketplace-token")
    token = token_values[0] if token_values else None

    if not token:
        return _redirect()

    table.put_item(
        Item={
            "token": token,
            "received_at": int(time.time()),
        }
    )
    # Never log the full token. Length + short prefix is enough to confirm receipt
    # in CloudWatch without exposing something we'll later use to call ResolveCustomer.
    print(f"Stored marketplace registration token (len={len(token)}, prefix={token[:6]}...)")

    return _redirect()
