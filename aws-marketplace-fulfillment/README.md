# AWS Marketplace fulfilment landing endpoint

A minimal Lambda that catches the POST AWS Marketplace sends when a buyer
subscribes, saves the registration token, and redirects them to
`smartbotsoftware.com/#contact-us` (the site's existing Contact Us form)
since Webflow can't accept the POST directly. Deliberately minimal — no
`ResolveCustomer` call, no entitlement check yet. That's the next phase,
once the full fulfilment flow is built.

## Status

**Deployed and live.**

- Table `aws-mp-registrations` created in DynamoDB (eu-west-2).
- Execution role `aws-mp-fulfillment-lambda-role` created, scoped to
  `PutItem` on just that table plus basic CloudWatch Logs write access
  (see `execution-role-policy.json`).
- Lambda function `aws-mp-fulfillment` deployed, Python 3.12.
- Fronted by an HTTP API Gateway (`aws-mp-fulfillment-api`), not a bare
  Lambda Function URL — the account has an org-level guardrail blocking
  public Function URLs, so API Gateway (`AWS_PROXY` integration, no auth)
  is used as the public entry point instead. Same Lambda code either way.

**Live endpoint (send this to Declan / set in the Marketplace Management
Portal):**

```
https://gspde9ay1e.execute-api.eu-west-2.amazonaws.com/
```

Tested: `curl -i -X POST -d "x-amzn-marketplace-token=test123" <endpoint>`
returns a `302` to `https://www.smartbotsoftware.com/#contact-us`, and the
token is confirmed stored in DynamoDB with a `received_at` timestamp.

## Redeploying after a code change

```
# zip the handler
powershell -Command "Compress-Archive -Path lambda_function.py -DestinationPath function.zip -Force"

# push the new code to the existing Lambda (from server/, where the AWS SDK clients are installed)
node -e "
import('@aws-sdk/client-lambda').then(async ({ LambdaClient, UpdateFunctionCodeCommand }) => {
  const { readFileSync } = await import('fs');
  const lambda = new LambdaClient({ region: 'eu-west-2' });
  await lambda.send(new UpdateFunctionCodeCommand({
    FunctionName: 'aws-mp-fulfillment',
    ZipFile: readFileSync('../aws-marketplace-fulfillment/function.zip'),
  }));
  console.log('Updated.');
});
"
```

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
