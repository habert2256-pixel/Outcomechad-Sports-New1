// OutcomeChad Sports
// SportMonks Football Transfers API v3
// Route: /api/football/transfers
// Environment variable: SPORTMONKS_API_TOKEN

const BASE_URL = 'https://api.sportmonks.com/v3/football';
const CACHE_SECONDS = 300;
const STALE_SECONDS = 600;
const MAX_PAGES = 5;
const PER_PAGE = 50;

function getRelation(value) {
  if (!value) return null;

  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value;
}

function normalizeTransfer(item) {
  const player = getRelation(item.player);
  const fromTeam = getRelation(item.fromTeam);
  const toTeam = getRelation(item.toTeam);
  const type = getRelation(item.type);

  const playerId = item.player_id || player?.id || null;
  const fromTeamId = item.from_team_id || fromTeam?.id || null;
  const toTeamId = item.to_team_id || toTeam?.id || null;

  const transferDate = item.date || null;

  return {
    id: String(item.id),

    recordId: item.id || null,

    player_id: playerId,

    player: {
      id: playerId,
      name: player?.display_name ||
        player?.name ||
        'Player information unavailable',
      image_path: player?.image_path || null,
      photo: player?.image_path || null
    },

    from_team_id: fromTeamId,

    fromteam: {
      id: fromTeamId,
      name: fromTeam?.name || 'Not reported',
      image_path: fromTeam?.image_path || null
    },

    to_team_id: toTeamId,

    toteam: {
      id: toTeamId,
      name: toTeam?.name || 'Not reported',
      image_path: toTeam?.image_path || null
    },

    probability: 'Not specified',

    amount: item.amount ?? null,

    currency: null,

    date: transferDate,

    endTime: null,

    season: null,

    type: {
      name: type?.name || 'Transfer',
      code: type?.id || item.type_id || null
    },

    source_name: 'SportMonks',

    source_url: null,

    completed: Boolean(item.completed),

    career_ended: Boolean(item.career_ended),

    modifyTime: item.completed_at || null,

    position_id: item.position_id || null,

    detailed_position_id: item.detailed_position_id || null
  };
}

async function fetchTransfers(apiToken, page) {
  const url = new URL(`${BASE_URL}/transfers/latest`);

  url.searchParams.set('api_token', apiToken);
  url.searchParams.set(
    'include',
    'player;fromTeam;toTeam;type'
  );
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('page', String(page));
  url.searchParams.set('order', 'desc');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      payload?.message || `SportMonks HTTP ${response.status}`
    );

    error.status = response.status;
    throw error;
  }

  if (!payload || !Array.isArray(payload.data)) {
    throw new Error('Invalid response from SportMonks.');
  }

  return payload;
}

export default async function handler(req, res) {
  res.setHeader(
    'Cache-Control',
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const apiToken = process.env.SPORTMONKS_API_TOKEN;

  if (!apiToken) {
    return res.status(500).json({
      success: false,
      provider: 'SportMonks',
      error: 'SPORTMONKS_API_TOKEN is not configured.'
    });
  }

  const requestedDays = Number(req.query.day || 30);

  const day = Number.isInteger(requestedDays)
    ? Math.min(Math.max(requestedDays, 1), 730)
    : 30;

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 25000);

  try {
    const allRecords = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const payload = await fetchTransfers(apiToken, page);

      allRecords.push(...payload.data);

      const pagination = payload.pagination;

      if (
        !pagination ||
        pagination.has_more === false ||
        payload.data.length < PER_PAGE
      ) {
        break;
      }
    }

    // Apply the requested date window locally.
    const cutoff = new Date();

    cutoff.setUTCDate(cutoff.getUTCDate() - day);

    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const filteredRecords = allRecords.filter(item => {
      if (!item.date) return false;

      return item.date >= cutoffDate;
    });

    const normalized = filteredRecords.map(normalizeTransfer);

    return res.status(200).json({
      success: true,
      provider: 'SportMonks',
      type: 'transfer_records',
      total: normalized.length,
      day,
      data: normalized
    });

  } catch (error) {
    console.error('SportMonks transfers API error:', {
      message: error.message,
      status: error.status || null
    });

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({
      success: false,
      provider: 'SportMonks',
      error:
        error.name === 'AbortError'
          ? 'SportMonks transfer request timed out.'
          : 'Unable to retrieve transfer records.',
      message: error.message
    });

  } finally {
    clearTimeout(timeout);
  }
}