// OutcomeChad Sports
// API Ninjas — Football Fixtures
// Route: /api/football/fixtures?date=YYYY-MM-DD
// Environment: API_NINJAS_KEY
//
// Supported competitions are configurable through:
// API_NINJAS_LEAGUES

const BASE_URL = 'https://api.api-ninjas.com/v1';

const CACHE_SECONDS = 60;
const STALE_SECONDS = 120;

const DEFAULT_LEAGUES = [
  'epl',
  'laliga',
  'bundesliga',
  'seriea',
  'ligue1',
  'ucl',
  'uel',
  'mls'
];

const STATUS_MAP = {
  scheduled: ['scheduled', 'TIMED'],
  in_progress: ['live', 'LIVE'],
  final: ['finished', 'FT'],
  postponed: ['other', 'POSTPONED'],
  canceled: ['other', 'CANCELLED'],
  suspended: ['other', 'SUSPENDED'],
  delayed: ['other', 'DELAYED']
};

function getLeagues(req) {

  if (req.query?.league) {
    return [String(req.query.league).trim().toLowerCase()];
  }

  if (req.query?.leagues) {

    return String(req.query.leagues)
      .split(',')
      .map(x => x.trim().toLowerCase())
      .filter(Boolean);

  }

  const configured =
    process.env.API_NINJAS_LEAGUES;

  if (configured) {

    return configured
      .split(',')
      .map(x => x.trim().toLowerCase())
      .filter(Boolean);

  }

  return DEFAULT_LEAGUES;

}

function validDate(date) {

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );

}

function numberOrNull(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;

}

function normalizeMatch(m) {

  const home = m.home_team || {};
  const away = m.away_team || {};

  const statusCode = String(
    m.status || 'scheduled'
  ).toLowerCase();

  const [status, statusName] =
    STATUS_MAP[statusCode] ||
    ['other', statusCode.toUpperCase()];

  const timestamp = m.start_time
    ? new Date(m.start_time)
    : null;

  const matchTime =
    timestamp &&
    !Number.isNaN(timestamp.getTime())
      ? timestamp.toISOString()
      : '';

  const periodScores = m.period_scores || {};

  const homeHalf =
    periodScores.home?.[0] ??
    periodScores.home_first_half ??
    null;

  const awayHalf =
    periodScores.away?.[0] ??
    periodScores.away_first_half ??
    null;

  const venue = m.venue || {};

  return {

    id: String(m.game_id),

    homeName: home.name || 'Home',
    awayName: away.name || 'Away',

    homeTeamId: home.team_id || '',
    awayTeamId: away.team_id || '',

    homeLogo: '',
    awayLogo: '',

    homeScore: numberOrNull(m.home_score),
    awayScore: numberOrNull(m.away_score),

    halfHome: numberOrNull(homeHalf),
    halfAway: numberOrNull(awayHalf),

    status,
    statusName,

    minute: (
      typeof m.clock === 'string' &&
      /^\d+/.test(m.clock)
    )
      ? m.clock
      : null,

    addedTime: null,

    matchTime,
    startingAt: matchTime,

    startingTimestamp: timestamp
      ? Math.floor(timestamp.getTime() / 1000)
      : null,

    competitionName: m.league || 'Football',

    league: {
      id: m.league || '',
      name: m.league || 'Football'
    },

    leagueId: m.league || '',

    leagueLogo: '',

    country: '',

    stageName: m.round || '',
    groupName: '',
    roundName: m.round || '',

    venue: venue.name || 'Venue unavailable',

    homeRank: '',
    awayRank: '',

    homeRed: 0,
    awayRed: 0,

    homeYellow: 0,
    awayYellow: 0,

    homeCorner: 0,
    awayCorner: 0,

    hasLineup: false,

    raw: m

  };

}

async function fetchLeague(apiKey, league, date, signal) {

  const url = new URL(
    '/v1/soccermatches',
    BASE_URL
  );

  url.searchParams.set('league', league);
  url.searchParams.set('date', date);

  const response = await fetch(url.toString(), {

    method: 'GET',

    headers: {
      Accept: 'application/json',
      'X-Api-Key': apiKey
    },

    signal

  });

  const payload = await response.json().catch(
    () => null
  );

  if (!response.ok) {

    throw new Error(
      payload?.error ||
      payload?.message ||
      `API Ninjas error ${response.status} for ${league}`
    );

  }

  if (!Array.isArray(payload)) {

    throw new Error(
      `Invalid response for ${league}`
    );

  }

  return payload;

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

  const apiKey = process.env.API_NINJAS_KEY;

  if (!apiKey) {

    return res.status(500).json({

      success: false,
      provider: 'API Ninjas',
      message: 'API_NINJAS_KEY is missing in Vercel.'

    });

  }

  const date = String(
    req.query?.date || ''
  ).trim();

  if (!validDate(date)) {

    return res.status(400).json({

      success: false,
      message: 'A valid date is required.'

    });

  }

  const leagues = [
    ...new Set(getLeagues(req))
  ];

  if (
    !leagues.length ||
    leagues.length > 30 ||
    leagues.some(x => !/^[a-z0-9]+$/.test(x))
  ) {

    return res.status(400).json({

      success: false,
      message: 'Invalid competition selection.'

    });

  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {

    controller.abort();

  }, 20000);

  try {

    const results = await Promise.allSettled(

      leagues.map(league =>
        fetchLeague(
          apiKey,
          league,
          date,
          controller.signal
        )
      )

    );

    const matches = [];
    const errors = [];

    results.forEach((result, index) => {

      const league = leagues[index];

      if (result.status === 'fulfilled') {

        matches.push(...result.value);

      } else {

        errors.push({

          league,

          message: result.reason?.message ||
            'Unable to retrieve competition.'

        });

      }

    });

    if (errors.length === leagues.length) {

      console.error(
        'API Ninjas fixtures errors:',
        errors
      );

      return res.status(502).json({

        success: false,

        provider: 'API Ninjas',

        message: 'Unable to retrieve football fixtures.',

        errors

      });

    }

    const normalized = matches

      .filter(m => m && m.game_id)

      .map(normalizeMatch)

      .sort((a, b) => {

        const dateA = Date.parse(a.matchTime) || 0;
        const dateB = Date.parse(b.matchTime) || 0;

        return dateA - dateB;

      });

    return res.status(200).json({

      success: true,

      provider: 'API Ninjas',

      date,

      competitions: leagues,

      total: normalized.length,

      partial: errors.length > 0,

      errors,

      data: normalized

    });

  } catch (error) {

    console.error(
      'API Ninjas fixtures error:',
      error.message
    );

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({

      success: false,

      provider: 'API Ninjas',

      message:
        error.name === 'AbortError'
          ? 'Fixtures request timed out.'
          : 'Unable to retrieve football fixtures.'

    });

  } finally {

    clearTimeout(timeout);

  }

}