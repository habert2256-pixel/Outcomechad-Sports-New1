// OutcomeChad Sports
// SportMonks Football Transfers API v3
// Route: /api/football/transfers
// Environment: SPORTMONKS_API_TOKEN

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

  return typeof value === 'object' ? value : null;
}

function getTeam(item, side) {
  const isFrom = side === 'from';

  const relation = isFrom
    ? item.fromteam || item.fromTeam || item.from_team
    : item.toteam || item.toTeam || item.to_team;

  return getRelation(relation);
}

function getTeamName(team) {
  return (
    team?.name ||
    team?.display_name ||
    'Club not confirmed'
  );
}

function getTeamLogo(team) {
  return team?.image_path || null;
}

function getAmount(item) {
  const value = item.amount;

  if (value === null || value === undefined || value === '') {
    return null;
  }

  const amount = Number(value);

  return Number.isFinite(amount) ? amount : null;
}

function normalizeTransfer(item) {
  const player = getRelation(item.player);
  const fromTeam = getTeam(item, 'from');
  const toTeam = getTeam(item, 'to');
  const type = getRelation(item.type);

  const playerId =
    item.player_id ||
    player?.id ||
    null;

  const fromTeamId =
    item.from_team_id ||
    fromTeam?.id ||
    null;

  const toTeamId =
    item.to_team_id ||
    toTeam?.id ||
    null;

  const amount = getAmount(item);

  const playerImage =
    player?.image_path ||
    player?.photo ||
    null;

  const transferDate = item.date || null;

  return {
    id: String(item.id),

    recordId: item.id || null,

    player_id: playerId,

    player: {
      id: playerId,

      name:
        player?.display_name ||
        player?.name ||
        'Player information unavailable',

      image_path: playerImage,
      photo: playerImage
    },

    from_team_id: fromTeamId,

    fromteam: {
      id: fromTeamId,
      name: getTeamName(fromTeam),
      image_path: getTeamLogo(fromTeam)
    },

    to_team_id: toTeamId,

    toteam: {
      id: toTeamId,
      name: getTeamName(toTeam),
      image_path: getTeamLogo(toTeam)
    },

    probability: 'Not specified',

    amount,

    feeDisplay:
      amount === null
        ? 'Fee undisclosed'
        : `${amount} EUR`,

    currency: amount !== null ? 'EUR' : null,

    date: transferDate,

    endTime: item.endTime || null,

    season: item.season || null,

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

    detailed_position_id:
      item.detailed_position_id || null
  };
}

async function fetchTransfers(apiToken, page, signal) {
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
    },

    signal
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.message ||
      `SportMonks returned HTTP ${response.status}`
    );
  }

  if (!payload || !Array.isArray(payload.data)) {
    throw new Error('Invalid SportMonks transfers response.');
  }

  return payload;
}

export default async function handler(req, res) {
  res.setHeader(
    'Cache-Control',
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

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
    const records = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const payload = await fetchTransfers(
        apiToken,
        page,
        controller.signal
      );

      records.push(...payload.data);

      const pagination = payload.pagination;

      if (
        !pagination ||
        pagination.has_more === false ||
        payload.data.length < PER_PAGE
      ) {
        break;
      }
    }

    const cutoff = new Date();

    cutoff.setUTCDate(cutoff.getUTCDate() - day);

    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const filtered = records.filter(item => {
      if (!item.date) return false;

      return String(item.date).slice(0, 10) >= cutoffDate;
    });

    const normalized = filtered.map(normalizeTransfer);

    return res.status(200).json({
      success: true,
      provider: 'SportMonks',
      type: 'transfer_records',
      total: normalized.length,
      day,
      data: normalized
    });

  } catch (error) {
    console.error('SportMonks transfers error:', {
      message: error.message
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