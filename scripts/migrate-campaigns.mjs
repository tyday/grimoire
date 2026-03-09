#!/usr/bin/env node
// =============================================================================
// migrate-campaigns.mjs — Backfill existing data with a default campaign
// =============================================================================
// This migration script:
//   1. Creates a default campaign ("Pathfinder Campaign")
//   2. Adds all existing users as members (first user found becomes GM)
//   3. Adds campaignId to all existing polls
//   4. Adds campaignId to all existing sessions
//
// Usage:
//   node scripts/migrate-campaigns.mjs <environment>
//
// Example:
//   node scripts/migrate-campaigns.mjs dev
//   node scripts/migrate-campaigns.mjs prod
//
// The script is idempotent — running it again won't create duplicates because
// it checks for an existing default campaign first.
// =============================================================================

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';

const env = process.argv[2];
if (!env || !['dev', 'prod'].includes(env)) {
  console.error('Usage: node scripts/migrate-campaigns.mjs <dev|prod>');
  process.exit(1);
}

const region = 'us-east-2';
const client = new DynamoDBClient({ region });
const db = DynamoDBDocumentClient.from(client);

// Table names follow the naming convention from Terraform
const TABLE_USERS = `grimoire-users-${env}`;
const TABLE_POLLS = `grimoire-polls-${env}`;
const TABLE_SESSIONS = `grimoire-sessions-${env}`;
const TABLE_CAMPAIGNS = `grimoire-campaigns-${env}`;
const TABLE_CAMPAIGN_MEMBERS = `grimoire-campaign-members-${env}`;

const DEFAULT_CAMPAIGN_NAME = 'Pathfinder Campaign';

async function migrate() {
  console.log(`\n🔮 Migrating ${env} environment...\n`);

  // -------------------------------------------------------------------------
  // Step 1: Check if a default campaign already exists
  // -------------------------------------------------------------------------
  const existingCampaigns = await db.send(new ScanCommand({
    TableName: TABLE_CAMPAIGNS,
  }));

  if (existingCampaigns.Items?.length > 0) {
    console.log(`Campaign(s) already exist. Using first one as default.`);
    const defaultCampaign = existingCampaigns.Items[0];
    console.log(`  Campaign: ${defaultCampaign.name} (${defaultCampaign.campaignId})`);
    await backfillData(defaultCampaign.campaignId);
    return;
  }

  // -------------------------------------------------------------------------
  // Step 2: Get all existing users
  // -------------------------------------------------------------------------
  const usersResult = await db.send(new ScanCommand({
    TableName: TABLE_USERS,
  }));
  const users = usersResult.Items || [];
  console.log(`Found ${users.length} user(s)`);

  if (users.length === 0) {
    console.log('No users found — nothing to migrate.');
    return;
  }

  // -------------------------------------------------------------------------
  // Step 3: Create the default campaign
  // -------------------------------------------------------------------------
  const campaignId = randomUUID();
  const now = new Date().toISOString();
  const gmUser = users[0]; // First user becomes GM

  await db.send(new PutCommand({
    TableName: TABLE_CAMPAIGNS,
    Item: {
      campaignId,
      name: DEFAULT_CAMPAIGN_NAME,
      description: 'Default campaign created during migration',
      createdBy: gmUser.userId,
      createdAt: now,
    },
  }));
  console.log(`Created campaign: ${DEFAULT_CAMPAIGN_NAME} (${campaignId})`);

  // -------------------------------------------------------------------------
  // Step 4: Add all users as campaign members
  // -------------------------------------------------------------------------
  for (const user of users) {
    const role = user.userId === gmUser.userId ? 'gm' : 'player';
    await db.send(new PutCommand({
      TableName: TABLE_CAMPAIGN_MEMBERS,
      Item: {
        campaignId,
        userId: user.userId,
        role,
        joinedAt: now,
      },
    }));
    console.log(`  Added ${user.name || user.email} as ${role}`);
  }

  // -------------------------------------------------------------------------
  // Step 5: Backfill polls and sessions
  // -------------------------------------------------------------------------
  await backfillData(campaignId);
}

async function backfillData(campaignId) {
  // Backfill polls
  const pollsResult = await db.send(new ScanCommand({
    TableName: TABLE_POLLS,
  }));
  const polls = pollsResult.Items || [];
  let pollsUpdated = 0;

  for (const poll of polls) {
    if (poll.campaignId) continue; // Already has a campaignId

    await db.send(new UpdateCommand({
      TableName: TABLE_POLLS,
      Key: { pollId: poll.pollId },
      UpdateExpression: 'SET campaignId = :cid',
      ExpressionAttributeValues: { ':cid': campaignId },
    }));
    pollsUpdated++;
  }
  console.log(`Updated ${pollsUpdated}/${polls.length} poll(s) with campaignId`);

  // Backfill sessions
  const sessionsResult = await db.send(new ScanCommand({
    TableName: TABLE_SESSIONS,
  }));
  const sessions = sessionsResult.Items || [];
  let sessionsUpdated = 0;

  for (const session of sessions) {
    if (session.campaignId) continue; // Already has a campaignId

    await db.send(new UpdateCommand({
      TableName: TABLE_SESSIONS,
      Key: { sessionId: session.sessionId },
      UpdateExpression: 'SET campaignId = :cid',
      ExpressionAttributeValues: { ':cid': campaignId },
    }));
    sessionsUpdated++;
  }
  console.log(`Updated ${sessionsUpdated}/${sessions.length} session(s) with campaignId`);

  console.log(`\nMigration complete!\n`);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
