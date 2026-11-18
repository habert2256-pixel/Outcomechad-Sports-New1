// OutcomeChad Sports
// API Ninjas — Live Football Scores
// Route: /api/football/live
// Environment: API_NINJAS_KEY

const BASE_URL = 'https://api.api-ninjas.com/v1';

const CACHE_SECONDS = 30;
const STALE_SECONDS = 30;

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

function getLeagues() {

  const configured =
    process.env.API_NINJAS_LEAGUES;

  if (!configured) {
    return DEFAULT_LEAGUES;
  }

  return [
    ...new Set(
      configured
        .split(',')
        .map(x => x.trim().toLowerCase())
        .filter(Boolean)
    )
  ];

}

function numberOrNull(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : null;

}

function normalizeMatch(m) {

  const home = m.home_team || {};
  const away = m.away_team || {};

  const rawStatus = String(
    m.status || 'scheduled'
  ).toLowerCase();

  let [status, statusName] =
    STATUS_MAP[rawStatus] ||
    ['other', rawStatus.toUpperCase()];

  const detail = String(
    m.status_detail || ''
  ).toLowerCase();

  if (status === 'live') {

    if (detail === 'halftime') {
      statusName = 'HT';
    }

    else if (detail === 'extra_time_break') {
      statusName = 'ET';
    }

    else if (detail === 'penalties') {
      statusName = 'PEN';
    }

    else if (Number(m.period) === 1) {
      statusName = '1H';
    }

    else if (Number(m.period) === 2) {
      statusName = '2H';
    }

    else if (Number(m.period) === 3 ||
             Number(m.period) === 4) {
      statusName = 'ET';
    }

  }

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
    periodScores.home?.[0] ?? null;

  const awayHalf =
    periodScores.away?.[0] ?? null;

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

    status,
    statusName,

    minute: m.clock ?? null,

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

    halfHome: numberOrNull(homeHalf),
    halfAway: numberOrNull(awayHalf),

    homeRed: 0,
    awayRed: 0,

    homeYellow: 0,
    awayYellow: 0,

    homeCorner: 0,
    awayCorner: 0,

    homeRank: '',
    awayRank: '',

    hasLineup: false,

    raw: m

  };

}

async function fetchLiveLeague(apiKey, league, signal) {

  const url = new URL(
    '/v1/soccermatches',
    BASE_URL
  );

  url.searchParams.set('league', league);

  url.searchParams.set(
    'status',
    'in_progress'
  );

  const response = await fetch(
    url.toString(),
    {
      method: 'GET',

      headers: {
        Accept: 'application/json',
        'X-Api-Key': apiKey
      },

      signal
    }
  );

  const payload = await response.json().catch(
    () => null
  );

  if (!response.ok) {

    throw new Error(
      payload?.error ||
      payload?.message ||
      `API Ninjas error ${response.status}: ${league}`
    );

  }

  if (!Array.isArray(payload)) {

    throw new Error(
      `Invalid API Ninjas response: ${league}`
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

  const leagues = getLeagues();

  if (
    !leagues.length ||
    leagues.length > 30 ||
    leagues.some(x => !/^[a-z0-9]+$/.test(x))
  ) {

    return res.status(400).json({

      success: false,

      provider: 'API Ninjas',

      message: 'Invalid competition configuration.'

    });

  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {

    controller.abort();

  }, 20000);

  try {

    const results = await Promise.allSettled(

      leagues.map(league =>
        fetchLiveLeague(
          apiKey,
          league,
          controller.signal
        )
      )

    );

    const matches = [];
    const errors = [];

    results.forEach((result, index) => {

      if (result.status === 'fulfilled') {

        matches.push(...result.value);

      } else {

        errors.push({

          league: leagues[index],

          message:
            result.reason?.message ||
            'Unable to retrieve live matches.'

        });

      }

    });

    if (errors.length === leagues.length) {

      console.error(
        'API Ninjas live errors:',
        errors
      );

      return res.status(502).json({

        success: false,

        provider: 'API Ninjas',

        message: 'Unable to retrieve live football scores.',

        errors

      });

    }

    const normalized = matches

      .filter(m => m && m.game_id)

      .map(normalizeMatch)

      .sort((a, b) =>
        (a.startingTimestamp || 0) -
        (b.startingTimestamp || 0)
      );

    return res.status(200).json({

      success: true,

      provider: 'API Ninjas',

      total: normalized.length,

      partial: errors.length > 0,

      errors,

      data: normalized

    });

  } catch (error) {

    console.error(
      'API Ninjas live error:',
      error.message
    );

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({

      success: false,

      provider: 'API Ninjas',

      message:
        error.name === 'AbortError'
          ? 'Live scores request timed out.'
          : 'Unable to retrieve API Ninjas live scores.'

    });

  } finally {

    clearTimeout(timeout);

  }

}