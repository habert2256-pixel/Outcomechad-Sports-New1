// OutcomeChad Sports
// Footballdata.io — Football Fixtures
// Route: /api/football/fixtures?date=YYYY-MM-DD

const BASE_URL = 'https://footballdata.io/api/v1';

const CACHE_SECONDS = 120;
const STALE_SECONDS = 300;

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

  let status = 'scheduled';

  if (
    ['live', 'in_play', 'inplay', 'half_time', 'halftime',
     'paused', 'extra_time', 'penalty_shootout'].includes(rawStatus)
  ) {
    status = 'live';
  } else if (
    ['complete', 'completed', 'finished', 'full_time', 'ft'].includes(rawStatus)
  ) {
    status = 'finished';
  } else if (
    ['postponed', 'cancelled', 'canceled', 'abandoned', 'suspended'].includes(rawStatus)
  ) {
    status = 'other';
  }

  const timestamp = m.date_unix
    ? new Date(Number(m.date_unix) * 1000).toISOString()
    : m.match_date || m.date || '';

  return {
    id: String(m.match_id ?? m.id),

    homeName: home.team_name || home.name || 'Home',
    awayName: away.team_name || away.name || 'Away',

    homeTeamId: home.team_id ?? home.id ?? '',
    awayTeamId: away.team_id ?? away.id ?? '',

    homeLogo: home.team_logo || home.logo || '',
    awayLogo: away.team_logo || away.logo || '',

    homeScore: score.home ?? null,
    awayScore: score.away ?? null,

    status,
    statusName: m.status_localized || rawStatus,

    minute: m.minute ?? null,

    addedTime: null,

    matchTime: timestamp,
    startingAt: timestamp,
    startingTimestamp: m.date_unix ?? null,

    competitionName:
      league.name ||
      league.competition_name ||
      'Football',

    league: league.name || 'Football',

    leagueId: league.league_id ?? league.id ?? null,

    leagueLogo:
      league.league_logo ||
      league.logo ||
      league.emblem ||
      '',

    country:
      league.country?.name ||
      league.country ||
      '',

    stageName: m.stage || '',
    stageId: m.stage_id ?? null,

    groupName: m.group || '',

    roundName:
      m.round ||
      (m.matchday ? `Matchday ${m.matchday}` : ''),

    venue: m.venue || 'Venue unavailable',

    homeFormation: m.lineups?.home?.formation || null,
    awayFormation: m.lineups?.away?.formation || null,

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

  const date = String(req.query?.date || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: 'A valid date is required.'
    });
  }

  const parsedDate = new Date(`${date}T00:00:00Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid calendar date.'
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), 20000);

  try {

    const url = new URL(
      `${BASE_URL}/matches/date/${date}`
    );

    url.searchParams.set('limit', '100');
    url.searchParams.set('page', '1');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('Footballdata.io fixtures error:', {
        status: response.status,
        message: payload?.error?.message || payload?.message
      });

      return res.status(response.status).json({
        success: false,
        provider: 'Footballdata.io',
        message:
          payload?.error?.message ||
          payload?.message ||
          'Fixtures request failed.',
        code: response.status
      });
    }

    const matches = getMatches(payload);

    const normalized = matches
      .map(normalizeMatch)
      .filter(m => m.id && m.homeName && m.awayName);

    return res.status(200).json({
      success: true,
      provider: 'Footballdata.io',
      date,
      total: normalized.length,
      data: normalized,
      pagination: payload?.meta?.pagination || null
    });

  } catch (error) {

    console.error('Fixtures error:', error.message);

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({
      success: false,
      provider: 'Footballdata.io',
      message: error.name === 'AbortError'
        ? 'Fixtures request timed out.'
        : 'Unable to retrieve football fixtures.'
    });

  } finally {
    clearTimeout(timeout);
  }
}