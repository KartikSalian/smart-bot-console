# AWS Marketplace fulfilment landing endpoint

A minimal Lambda that catches the POST AWS Marketplace sends when a buyer
subscribes, saves the registration token, and redirects them to
`smartbotsoftware.com/aws-marketplace` since Webflow can't accept the POST
directly. Deliberately minimal — no `ResolveCustomer` call, no entitlement
check yet. That's the next phase, once the full fulfilment flow is built.

## Status

Code is written and locally tested. **Not yet deployed** — the `KARTIK` IAM
user doesn't currently have permission to create a Lambda function or a
DynamoDB table (verified directly, not assumed). Needs:

- `lambda:CreateFunction`
- `lambda:CreateFunctionUrlConfig`
- `dynamodb:CreateTable`

(IAM role creation for the Lambda's own execution role is already allowed —
`iam:CreateRole`, `PutRolePolicy`, `PassRole` all work, so that part needs no
extra grant.)

## Deploy steps, once permissions are in place

1. **Create the DynamoDB table**: name `aws-mp-registrations`, partition key
   `token` (String). On-demand billing is fine for this volume.
2. **Create the execution role** for the Lambda, attach the policy in
   `execution-role-policy.json` (scoped to `PutItem` on just this table,
   plus basic CloudWatch Logs write access — nothing broader).
3. **Create the Lambda function**:
   - Runtime: Python 3.12
   - Handler: `lambda_function.handler`
   - Code: `lambda_function.py`
   - Environment variable: `TABLE_NAME=aws-mp-registrations` (optional —
     defaults to this value if unset)
4. **Add a Function URL** to the Lambda, auth type `NONE`.
5. **Test it**:
   ```
   curl -i -X POST -d "x-amzn-marketplace-token=test123" <function-url>
   ```
   Expect a `302` with `Location: https://www.smartbotsoftware.com/aws-marketplace`,
   and a `test123` row in the DynamoDB table.
6. Send Declan the Function URL. He updates the Marketplace Management Portal
   himself — nothing here touches the listing.

## Local testing (no AWS access needed)

```
pip install boto3
AWS_DEFAULT_REGION=eu-west-2 python -m unittest test_lambda_function.py -v
```

Mocks the DynamoDB table entirely — verifies the routing/parsing logic only
(GET → redirect, POST without token → redirect, POST with token → store +
redirect, base64-encoded body handling). All 4 cases pass as of this commit.

## Notes for whoever extends this later

- The token is intentionally never logged in full — only its length and a
  6-character prefix, so CloudWatch logs can confirm receipt without
  exposing something that'll later be used to call `ResolveCustomer`.
- `received_at` is a Unix timestamp (int), stored alongside the token —
  useful for the next phase when processing a backlog of registrations.
- This endpoint is isolated from the rest of the `smart-bot-console`
  dashboard app on purpose — different AWS service (Lambda, not SageMaker),
  different purpose (marketplace fulfilment, not call analytics), no
  shared code or state.
