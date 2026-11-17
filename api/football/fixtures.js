// OutcomeChad Sports
// iSports API — Football Fixtures
// Endpoint: /api/football/fixtures?date=YYYY-MM-DD
// Provider: iSports API
// Environment: ISPORTS_API_KEY

const BASE_URL = 'https://api.isportsapi.com';

const CACHE_SECONDS = 60;
const STALE_SECONDS = 120;

const STATUS_MAP = {
  '0': ['scheduled', 'TIMED'],
  '1': ['live', '1H'],
  '2': ['live', 'HT'],
  '3': ['live', '2H'],
  '4': ['live', 'ET'],
  '5': ['live', 'PEN'],
  '-1': ['finished', 'FT'],
  '-10': ['other', 'CANCELLED'],
  '-11': ['other', 'TBD'],
  '-12': ['other', 'TERMINATED'],
  '-13': ['other', 'INTERRUPTED'],
  '-14': ['other', 'POSTPONED']
};

function normalizeMatch(m) {

  const [status, statusName] =
    STATUS_MAP[String(m.status)] || ['other', 'UNKNOWN'];

  const timestamp = Number(m.matchTime);

  const date = timestamp > 0
    ? new Date(timestamp * 1000).toISOString()
    : '';

  return {

    id: String(m.matchId),

    homeName: m.homeName || 'Home',
    awayName: m.awayName || 'Away',

    homeTeamId: m.homeId || '',
    awayTeamId: m.awayId || '',

    homeLogo: '',
    awayLogo: '',

    homeScore: m.homeScore ?? null,
    awayScore: m.awayScore ?? null,

    halfHome: m.homeHalfScore ?? null,
    halfAway: m.awayHalfScore ?? null,

    status,
    statusName,

    minute: m.minute ?? null,
    addedTime: m.injuryTime ?? null,

    matchTime: date,
    startingAt: date,

    startingTimestamp: timestamp || null,

    competitionName: m.leagueName || 'Football',

    league: {
      id: m.leagueId || '',
      name: m.leagueName || 'Football'
    },

    leagueId: m.leagueId || '',
    leagueLogo: '',

    country: '',

    stageName: m.round || '',
    groupName: m.group || '',
    roundName: m.round || '',

    venue: m.location || 'Venue unavailable',

    homeRank: m.homeRank || '',
    awayRank: m.awayRank || '',

    homeRed: m.homeRed ?? 0,
    awayRed: m.awayRed ?? 0,

    homeYellow: m.homeYellow ?? 0,
    awayYellow: m.awayYellow ?? 0,

    homeCorner: m.homeCorner ?? 0,
    awayCorner: m.awayCorner ?? 0,

    hasLineup: m.hasLineup === true,

    raw: m

  };

}

function extractMatches(payload) {

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.data?.matches)) {
    return payload.data.matches;
  }

  if (Array.isArray(payload?.matches)) {
    return payload.matches;
  }

  return null;

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

  const apiKey = process.env.ISPORTS_API_KEY;

  if (!apiKey) {

    return res.status(500).json({
      success: false,
      provider: 'iSports',
      message: 'ISPORTS_API_KEY is missing in Vercel.'
    });

  }

  const date = String(
    req.query?.date || ''
  ).trim();

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

  const timeout = setTimeout(
    () => controller.abort(),
    20000
  );

  try {

    const url = new URL(
      '/sport/football/schedule',
      BASE_URL
    );

    url.searchParams.set('date', date);
    url.searchParams.set('api_key', apiKey);

    const response = await fetch(url.toString(), {

      method: 'GET',

      headers: {
        Accept: 'application/json'
      },

      signal: controller.signal

    });

    const payload = await response.json().catch(
      () => null
    );

    if (!response.ok) {

      console.error('iSports fixtures error:', {
        status: response.status,
        message: payload?.message,
        code: payload?.code
      });

      return res.status(response.status).json({

        success: false,

        provider: 'iSports',

        message:
          payload?.message ||
          'iSports fixtures request failed.',

        upstreamStatus: response.status

      });

    }

    const matches = extractMatches(payload);

    if (!matches) {

      console.error(
        'Unexpected iSports response:',
        payload
      );

      return res.status(502).json({

        success: false,

        provider: 'iSports',

        message: 'Unexpected iSports API response format.'

      });

    }

    const normalized = matches
      .filter(m => m && m.matchId != null)
      .map(normalizeMatch);

    return res.status(200).json({

      success: true,

      provider: 'iSports',

      date,

      total: normalized.length,

      data: normalized

    });

  } catch (error) {

    console.error(
      'iSports fixtures error:',
      error.message
    );

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({

      success: false,

      provider: 'iSports',

      message:
        error.name === 'AbortError'
          ? 'iSports fixtures request timed out.'
          : 'Unable to retrieve iSports fixtures.'

    });

  } finally {

    clearTimeout(timeout);

  }

}