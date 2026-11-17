// OutcomeChad Sports
// Footballdata.io — Live Football Scores
// Route: /api/football/live

const BASE_URL = 'https://footballdata.io/api/v1';

const CACHE_SECONDS = 30;
const STALE_SECONDS = 60;

function getMatches(payload) {

  if (Array.isArray(payload?.data?.matches)) {
    return payload.data.matches;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.matches)) {
    return payload.matches;
  }

  return [];
}

function normalizeMatch(m) {

  const home = m.home_team || {};
  const away = m.away_team || {};
  const league = m.league || {};
  const score = m.score || {};

  const rawStatus = String(m.status || '').toLowerCase();

  let statusText = 'LIVE';

  if (['paused', 'half_time', 'halftime'].includes(rawStatus)) {
    statusText = 'HT';
  } else if (rawStatus === 'extra_time') {
    statusText = 'ET';
  } else if (rawStatus === 'penalty_shootout') {
    statusText = 'PEN';
  }

  const timestamp = m.date_unix
    ? new Date(Number(m.date_unix) * 1000).toISOString()
    : m.match_date || m.date || '';

  return {

    id: String(m.match_id ?? m.id),

    home: {
      id: home.team_id ?? home.id ?? null,
      name: home.team_name || home.name || 'Home',
      logo: home.team_logo || home.logo || null,
      score: score.home ?? null
    },

    away: {
      id: away.team_id ?? away.id ?? null,
      name: away.team_name || away.name || 'Away',
      logo: away.team_logo || away.logo || null,
      score: score.away ?? null
    },

    homeName: home.team_name || home.name || 'Home',
    awayName: away.team_name || away.name || 'Away',

    homeTeamId: home.team_id ?? home.id ?? null,
    awayTeamId: away.team_id ?? away.id ?? null,

    homeLogo: home.team_logo || home.logo || null,
    awayLogo: away.team_logo || away.logo || null,

    homeScore: score.home ?? null,
    awayScore: score.away ?? null,

    competitionName:
      league.name ||
      league.competition_name ||
      'Football',

    league: {
      id: league.league_id ?? league.id ?? null,
      name: league.name || 'Football',
      image_path:
        league.league_logo ||
        league.logo ||
        league.emblem ||
        null
    },

    leagueId: league.league_id ?? league.id ?? null,

    leagueLogo:
      league.league_logo ||
      league.logo ||
      league.emblem ||
      null,

    country: league.country?.name || league.country || '',

    starting_at: timestamp,
    startingAt: timestamp,
    matchTime: timestamp,

    status: 'LIVE',
    statusName: statusText,

    minute: m.minute ?? null,
    addedTime: null,
    seconds: null,

    venue: m.venue || null,

    stageName: m.stage || '',
    groupName: m.group || '',

    roundName:
      m.round ||
      (m.matchday ? `Matchday ${m.matchday}` : ''),

    raw: m
  };
}

export default async function handler(req, res) {

  res.setHeader(
    'Cache-Control',
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');

    return res.status(405).json({
      success: false,
      message: 'Method not allowed.'
    });
  }

  const token = process.env.FOOTBALL_DATA_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      success: false,
      provider: 'Footballdata.io',
      message: 'FOOTBALL_DATA_API_TOKEN is missing.'
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), 15000);

  try {

    const response = await fetch(
      `${BASE_URL}/fixtures/live`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        signal: controller.signal
      }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {

      console.error('Footballdata.io live error:', {
        status: response.status,
        message: payload?.error?.message || payload?.message
      });

      return res.status(response.status).json({
        success: false,
        provider: 'Footballdata.io',
        message:
          payload?.error?.message ||
          payload?.message ||
          'Unable to retrieve live football scores.',
        code: response.status
      });
    }

    const matches = getMatches(payload);

    const normalized = matches.map(normalizeMatch);

    return res.status(200).json({
      success: true,
      provider: 'Footballdata.io',
      total: normalized.length,
      data: normalized
    });

  } catch (error) {

    console.error('Live API error:', error.message);

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({
      success: false,
      provider: 'Footballdata.io',
      message: error.name === 'AbortError'
        ? 'Live scores request timed out.'
        : 'Unable to retrieve live scores.'
    });

  } finally {
    clearTimeout(timeout);
  }
}