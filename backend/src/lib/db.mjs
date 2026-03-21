// =============================================================================
// db.mjs — DynamoDB client and helpers
// =============================================================================
// We use the AWS SDK v3 "Document Client" which automatically converts
// between JavaScript objects and DynamoDB's native format.
//
// Without the Document Client, you'd write:
//   { email: { S: "ty@example.com" }, age: { N: "30" } }
//
// With the Document Client, you just write:
//   { email: "ty@example.com", age: 30 }
//
// The AWS SDK is pre-installed in the Lambda runtime (that's why it's in
// devDependencies, not dependencies — we use it locally for types/testing
// but don't bundle it). The --external:@aws-sdk flag in our esbuild config
// tells the bundler to skip it.
// =============================================================================

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client);

// Shorthand helpers to reduce boilerplate in route handlers
export const db = {
  get: (params) => docClient.send(new GetCommand(params)),
  put: (params) => docClient.send(new PutCommand(params)),
  query: (params) => docClient.send(new QueryCommand(params)),
  delete: (params) => docClient.send(new DeleteCommand(params)),
  update: (params) => docClient.send(new UpdateCommand(params)),
  scan: (params) => docClient.send(new ScanCommand(params)),
};
