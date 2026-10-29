"""Local sanity tests for the fulfilment Lambda's routing/parsing logic.

Mocks the DynamoDB table so this runs with zero AWS access needed — just
verifies the handler does the right thing for each case before it ever
touches real infrastructure.
"""

import base64
import unittest
from unittest.mock import MagicMock, patch


class TestFulfilmentHandler(unittest.TestCase):
    def setUp(self):
        self.table_patch = patch("lambda_function.table", MagicMock())
        self.mock_table = self.table_patch.start()

    def tearDown(self):
        self.table_patch.stop()

    def test_get_request_redirects_without_touching_dynamo(self):
        import lambda_function

        event = {"requestContext": {"http": {"method": "GET"}}}
        result = lambda_function.handler(event, None)

        self.assertEqual(result["statusCode"], 302)
        self.assertEqual(result["headers"]["Location"], "https://www.smartbotsoftware.com/#contact-us")
        self.mock_table.put_item.assert_not_called()

    def test_post_without_token_redirects_without_touching_dynamo(self):
        import lambda_function

        event = {"requestContext": {"http": {"method": "POST"}}, "body": "", "isBase64Encoded": False}
        result = lambda_function.handler(event, None)

        self.assertEqual(result["statusCode"], 302)
        self.mock_table.put_item.assert_not_called()

    def test_post_with_token_stores_and_redirects(self):
        import lambda_function

        event = {
            "requestContext": {"http": {"method": "POST"}},
            "body": "x-amzn-marketplace-token=test123",
            "isBase64Encoded": False,
        }
        result = lambda_function.handler(event, None)

        self.assertEqual(result["statusCode"], 302)
        self.assertEqual(result["headers"]["Location"], "https://www.smartbotsoftware.com/#contact-us")
        self.mock_table.put_item.assert_called_once()
        item = self.mock_table.put_item.call_args.kwargs["Item"]
        self.assertEqual(item["token"], "test123")
        self.assertIn("received_at", item)

    def test_post_with_base64_encoded_body(self):
        import lambda_function

        raw_body = "x-amzn-marketplace-token=abc-base64-token"
        event = {
            "requestContext": {"http": {"method": "POST"}},
            "body": base64.b64encode(raw_body.encode()).decode(),
            "isBase64Encoded": True,
        }
        result = lambda_function.handler(event, None)

        self.assertEqual(result["statusCode"], 302)
        item = self.mock_table.put_item.call_args.kwargs["Item"]
        self.assertEqual(item["token"], "abc-base64-token")


if __name__ == "__main__":
    unittest.main()
