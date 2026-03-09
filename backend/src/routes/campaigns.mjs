// =============================================================================
// campaigns.mjs — Campaign management routes
// =============================================================================
// Endpoints:
//   POST   /campaigns              - Create a new campaign (creator becomes GM)
//   GET    /campaigns              - List campaigns the user belongs to
//   GET    /campaigns/:campaignId  - Get a single campaign with members
//   POST   /campaigns/:campaignId/members - Add a member to a campaign
//   DELETE /campaigns/:campaignId/members/:userId - Remove a member
// =============================================================================

import { db } from '../lib/db.mjs';
import { authenticate } from '../lib/auth.mjs';
import { randomUUID } from 'node:crypto';

const TABLE_CAMPAIGNS = process.env.TABLE_CAMPAIGNS;
const TABLE_CAMPAIGN_MEMBERS = process.env.TABLE_CAMPAIGN_MEMBERS;
const TABLE_USERS = process.env.TABLE_USERS;

// ---------------------------------------------------------------------------
// Parse request body (handles base64 encoding from API Gateway)
// ---------------------------------------------------------------------------
function parseBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString()
    : event.body;
  return JSON.parse(raw || '{}');
}

// ---------------------------------------------------------------------------
// POST /campaigns — Create a campaign
// ---------------------------------------------------------------------------
async function createCampaign(event) {
  const user = await authenticate(event);
  if (!user) return { statusCode: 401, body: { error: 'Unauthorized' } };

  const { name, description } = parseBody(event);
  if (!name?.trim()) {
    return { statusCode: 400, body: { error: 'Campaign name is required' } };
  }

  const campaignId = randomUUID();
  const now = new Date().toISOString();

  // Create the campaign
  await db.put({
    TableName: TABLE_CAMPAIGNS,
    Item: {
      campaignId,
      name: name.trim(),
      description: description?.trim() || '',
      createdBy: user.sub,
      createdAt: now,
    },
  });

  // Add the creator as GM
  await db.put({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Item: {
      campaignId,
      userId: user.sub,
      role: 'gm',
      joinedAt: now,
    },
  });

  return {
    statusCode: 201,
    body: { campaignId, name: name.trim(), description: description?.trim() || '', createdAt: now },
  };
}

// ---------------------------------------------------------------------------
// GET /campaigns — List campaigns for the authenticated user
// ---------------------------------------------------------------------------
async function listCampaigns(event) {
  const user = await authenticate(event);
  if (!user) return { statusCode: 401, body: { error: 'Unauthorized' } };

  // Query the user-campaigns-index GSI to find all campaigns this user belongs to
  const memberships = await db.query({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    IndexName: 'user-campaigns-index',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': user.sub },
  });

  if (!memberships.Items?.length) {
    return { body: { campaigns: [] } };
  }

  // Fetch the campaign details for each membership
  const campaigns = await Promise.all(
    memberships.Items.map(async (m) => {
      const result = await db.get({
        TableName: TABLE_CAMPAIGNS,
        Key: { campaignId: m.campaignId },
      });
      return result.Item ? { ...result.Item, role: m.role } : null;
    }),
  );

  return {
    body: { campaigns: campaigns.filter(Boolean) },
  };
}

// ---------------------------------------------------------------------------
// GET /campaigns/:campaignId — Get a campaign with its members
// ---------------------------------------------------------------------------
async function getCampaign(event) {
  const user = await authenticate(event);
  if (!user) return { statusCode: 401, body: { error: 'Unauthorized' } };

  const { campaignId } = event.pathParams;

  // Verify user is a member of this campaign
  const membership = await db.get({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Key: { campaignId, userId: user.sub },
  });
  if (!membership.Item) {
    return { statusCode: 403, body: { error: 'Not a member of this campaign' } };
  }

  // Fetch campaign details and all members in parallel
  const [campaignResult, membersResult] = await Promise.all([
    db.get({ TableName: TABLE_CAMPAIGNS, Key: { campaignId } }),
    db.query({
      TableName: TABLE_CAMPAIGN_MEMBERS,
      KeyConditionExpression: 'campaignId = :cid',
      ExpressionAttributeValues: { ':cid': campaignId },
    }),
  ]);

  if (!campaignResult.Item) {
    return { statusCode: 404, body: { error: 'Campaign not found' } };
  }

  // Enrich members with user names
  const members = await Promise.all(
    (membersResult.Items || []).map(async (m) => {
      const userResult = await db.get({
        TableName: TABLE_USERS,
        Key: { userId: m.userId },
      });
      return {
        userId: m.userId,
        name: userResult.Item?.name || 'Unknown',
        role: m.role,
        joinedAt: m.joinedAt,
      };
    }),
  );

  return {
    body: {
      campaign: campaignResult.Item,
      members,
    },
  };
}

// ---------------------------------------------------------------------------
// POST /campaigns/:campaignId/members — Add a member to a campaign
// ---------------------------------------------------------------------------
async function addMember(event) {
  const user = await authenticate(event);
  if (!user) return { statusCode: 401, body: { error: 'Unauthorized' } };

  const { campaignId } = event.pathParams;
  const { userId, role } = parseBody(event);

  if (!userId) {
    return { statusCode: 400, body: { error: 'userId is required' } };
  }

  // Verify the requester is a member of this campaign
  const membership = await db.get({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Key: { campaignId, userId: user.sub },
  });
  if (!membership.Item) {
    return { statusCode: 403, body: { error: 'Not a member of this campaign' } };
  }

  // Verify the target user exists
  const targetUser = await db.get({
    TableName: TABLE_USERS,
    Key: { userId },
  });
  if (!targetUser.Item) {
    return { statusCode: 404, body: { error: 'User not found' } };
  }

  const now = new Date().toISOString();
  await db.put({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Item: {
      campaignId,
      userId,
      role: role === 'gm' ? 'gm' : 'player',
      joinedAt: now,
    },
  });

  return {
    statusCode: 201,
    body: { campaignId, userId, role: role === 'gm' ? 'gm' : 'player', joinedAt: now },
  };
}

// ---------------------------------------------------------------------------
// DELETE /campaigns/:campaignId/members/:userId — Remove a member
// ---------------------------------------------------------------------------
async function removeMember(event) {
  const user = await authenticate(event);
  if (!user) return { statusCode: 401, body: { error: 'Unauthorized' } };

  const { campaignId, userId } = event.pathParams;

  // Verify the requester is a member of this campaign
  const membership = await db.get({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Key: { campaignId, userId: user.sub },
  });
  if (!membership.Item) {
    return { statusCode: 403, body: { error: 'Not a member of this campaign' } };
  }

  await db.delete({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Key: { campaignId, userId },
  });

  return { body: { message: 'Member removed' } };
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------
export const campaignRoutes = [
  ['POST', '/campaigns', createCampaign],
  ['GET', '/campaigns', listCampaigns],
  ['GET', '/campaigns/:campaignId', getCampaign],
  ['POST', '/campaigns/:campaignId/members', addMember],
  ['DELETE', '/campaigns/:campaignId/members/:userId', removeMember],
];
