// =============================================================================
// campaigns.mjs — Campaign management routes
// =============================================================================
// Endpoints:
//   POST   /campaigns                       - Create a new campaign (creator becomes GM)
//   GET    /campaigns                       - List campaigns the user belongs to
//   GET    /campaigns/browse                - Browse all public campaigns
//   GET    /campaigns/:campaignId           - Get a campaign with members + sessions
//   POST   /campaigns/:campaignId/join      - Self-join a public campaign as player
//   POST   /campaigns/:campaignId/leave     - Leave a campaign (GM cannot leave)
//   POST   /campaigns/:campaignId/members   - Add a member (GM only)
//   PATCH  /campaigns/:campaignId/members/:userId - Change a member's role (GM only)
//   DELETE /campaigns/:campaignId/members/:userId - Remove a member
//   GET    /users                           - List all registered users
// =============================================================================

import { db } from '../lib/db.mjs';
import { authenticate } from '../lib/auth.mjs';
import { randomUUID } from 'node:crypto';

const TABLE_CAMPAIGNS = process.env.TABLE_CAMPAIGNS;
const TABLE_CAMPAIGN_MEMBERS = process.env.TABLE_CAMPAIGN_MEMBERS;
const TABLE_USERS = process.env.TABLE_USERS;
const TABLE_SESSIONS = process.env.TABLE_SESSIONS;

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
      visibility: 'public',
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
// GET /campaigns/browse — Browse all public campaigns
// ---------------------------------------------------------------------------
async function browseCampaigns(event) {
  const user = await authenticate(event);
  if (!user) return { statusCode: 401, body: { error: 'Unauthorized' } };

  // Scan all campaigns (small table — a handful of campaigns)
  const campaignsResult = await db.scan({ TableName: TABLE_CAMPAIGNS });
  const allCampaigns = campaignsResult.Items || [];

  // For each campaign, get member count and check if requesting user is a member
  const campaigns = await Promise.all(
    allCampaigns
      .filter((c) => (c.visibility || 'public') === 'public')
      .map(async (c) => {
        const membersResult = await db.query({
          TableName: TABLE_CAMPAIGN_MEMBERS,
          KeyConditionExpression: 'campaignId = :cid',
          ExpressionAttributeValues: { ':cid': c.campaignId },
        });
        const members = membersResult.Items || [];
        const userMembership = members.find((m) => m.userId === user.sub);
        return {
          campaignId: c.campaignId,
          name: c.name,
          description: c.description,
          createdAt: c.createdAt,
          visibility: c.visibility || 'public',
          memberCount: members.length,
          isMember: !!userMembership,
          role: userMembership?.role || null,
        };
      }),
  );

  return { body: { campaigns } };
}

// ---------------------------------------------------------------------------
// GET /campaigns/:campaignId — Get a campaign with members and sessions
// ---------------------------------------------------------------------------
async function getCampaign(event) {
  const user = await authenticate(event);
  if (!user) return { statusCode: 401, body: { error: 'Unauthorized' } };

  const { campaignId } = event.pathParams;

  // Fetch campaign, members, and sessions in parallel
  const [campaignResult, membersResult, sessionsResult, membership] = await Promise.all([
    db.get({ TableName: TABLE_CAMPAIGNS, Key: { campaignId } }),
    db.query({
      TableName: TABLE_CAMPAIGN_MEMBERS,
      KeyConditionExpression: 'campaignId = :cid',
      ExpressionAttributeValues: { ':cid': campaignId },
    }),
    db.query({
      TableName: TABLE_SESSIONS,
      IndexName: 'campaign-date-index',
      KeyConditionExpression: 'campaignId = :cid',
      ExpressionAttributeValues: { ':cid': campaignId },
    }),
    db.get({
      TableName: TABLE_CAMPAIGN_MEMBERS,
      Key: { campaignId, userId: user.sub },
    }),
  ]);

  if (!campaignResult.Item) {
    return { statusCode: 404, body: { error: 'Campaign not found' } };
  }

  // Allow access if campaign is public (or no visibility set = public) or user is a member
  const isPublic = (campaignResult.Item.visibility || 'public') === 'public';
  if (!isPublic && !membership.Item) {
    return { statusCode: 403, body: { error: 'Not a member of this campaign' } };
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
      sessions: sessionsResult.Items || [],
      currentUser: {
        isMember: !!membership.Item,
        role: membership.Item?.role || null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// POST /campaigns/:campaignId/join — Self-join a public campaign as player
// ---------------------------------------------------------------------------
async function joinCampaign(event) {
  const user = await authenticate(event);
  if (!user) return { statusCode: 401, body: { error: 'Unauthorized' } };

  const { campaignId } = event.pathParams;

  // Verify campaign exists and is public
  const campaignResult = await db.get({
    TableName: TABLE_CAMPAIGNS,
    Key: { campaignId },
  });
  if (!campaignResult.Item) {
    return { statusCode: 404, body: { error: 'Campaign not found' } };
  }
  if ((campaignResult.Item.visibility || 'public') !== 'public') {
    return { statusCode: 403, body: { error: 'This campaign is not open for joining' } };
  }

  // Check if already a member
  const existing = await db.get({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Key: { campaignId, userId: user.sub },
  });
  if (existing.Item) {
    return { statusCode: 409, body: { error: 'Already a member of this campaign' } };
  }

  const now = new Date().toISOString();
  await db.put({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Item: { campaignId, userId: user.sub, role: 'player', joinedAt: now },
  });

  return {
    statusCode: 201,
    body: { campaignId, userId: user.sub, role: 'player', joinedAt: now },
  };
}

// ---------------------------------------------------------------------------
// POST /campaigns/:campaignId/leave — Leave a campaign (GM cannot leave)
// ---------------------------------------------------------------------------
async function leaveCampaign(event) {
  const user = await authenticate(event);
  if (!user) return { statusCode: 401, body: { error: 'Unauthorized' } };

  const { campaignId } = event.pathParams;

  const membership = await db.get({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Key: { campaignId, userId: user.sub },
  });
  if (!membership.Item) {
    return { statusCode: 404, body: { error: 'Not a member of this campaign' } };
  }
  if (membership.Item.role === 'gm') {
    return { statusCode: 403, body: { error: 'GM cannot leave the campaign' } };
  }

  await db.delete({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Key: { campaignId, userId: user.sub },
  });

  return { body: { message: 'Left campaign' } };
}

// ---------------------------------------------------------------------------
// POST /campaigns/:campaignId/members — Add a member (GM only)
// ---------------------------------------------------------------------------
async function addMember(event) {
  const user = await authenticate(event);
  if (!user) return { statusCode: 401, body: { error: 'Unauthorized' } };

  const { campaignId } = event.pathParams;
  const { userId, role } = parseBody(event);

  if (!userId) {
    return { statusCode: 400, body: { error: 'userId is required' } };
  }

  // Only GMs can add members directly
  const membership = await db.get({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Key: { campaignId, userId: user.sub },
  });
  if (!membership.Item || membership.Item.role !== 'gm') {
    return { statusCode: 403, body: { error: 'Only the GM can add members' } };
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
// PATCH /campaigns/:campaignId/members/:userId — Change a member's role (GM only)
// ---------------------------------------------------------------------------
async function updateMemberRole(event) {
  const user = await authenticate(event);
  if (!user) return { statusCode: 401, body: { error: 'Unauthorized' } };

  const { campaignId, userId } = event.pathParams;
  const { role } = parseBody(event);

  if (role !== 'gm' && role !== 'player') {
    return { statusCode: 400, body: { error: 'Role must be "gm" or "player"' } };
  }

  // Only GMs can change roles
  const membership = await db.get({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Key: { campaignId, userId: user.sub },
  });
  if (!membership.Item || membership.Item.role !== 'gm') {
    return { statusCode: 403, body: { error: 'Only the GM can change roles' } };
  }

  // Can't change your own role (prevents GM from demoting themselves)
  if (userId === user.sub) {
    return { statusCode: 400, body: { error: 'Cannot change your own role' } };
  }

  // Verify target is a member
  const target = await db.get({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Key: { campaignId, userId },
  });
  if (!target.Item) {
    return { statusCode: 404, body: { error: 'Member not found' } };
  }

  await db.update({
    TableName: TABLE_CAMPAIGN_MEMBERS,
    Key: { campaignId, userId },
    UpdateExpression: 'SET #r = :role',
    ExpressionAttributeNames: { '#r': 'role' },
    ExpressionAttributeValues: { ':role': role },
  });

  return { body: { campaignId, userId, role } };
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
// GET /users — List all registered users (for GM user picker)
// ---------------------------------------------------------------------------
async function listUsers(event) {
  const user = await authenticate(event);
  if (!user) return { statusCode: 401, body: { error: 'Unauthorized' } };

  const result = await db.scan({ TableName: TABLE_USERS });
  const users = (result.Items || []).map((u) => ({
    userId: u.userId,
    name: u.name,
    email: u.email,
  }));

  return { body: { users } };
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------
export const campaignRoutes = [
  ['POST', '/campaigns', createCampaign],
  ['GET', '/campaigns', listCampaigns],
  ['GET', '/campaigns/browse', browseCampaigns],     // Must be before :campaignId
  ['GET', '/campaigns/:campaignId', getCampaign],
  ['POST', '/campaigns/:campaignId/join', joinCampaign],
  ['POST', '/campaigns/:campaignId/leave', leaveCampaign],
  ['POST', '/campaigns/:campaignId/members', addMember],
  ['PATCH', '/campaigns/:campaignId/members/:userId', updateMemberRole],
  ['DELETE', '/campaigns/:campaignId/members/:userId', removeMember],
  ['GET', '/users', listUsers],
];
