// OutcomeChad Sports
// iSports API — Football Match Statistics
// Route: /api/football/stats?matchId=123&date=YYYY-MM-DD
// Environment: ISPORTS_API_KEY

const BASE_URL = 'https://api.isportsapi.com';

const CACHE_SECONDS = 30;
const STALE_SECONDS = 30;

// iSports statistics type codes
const STAT_TYPES = {
  0: 'Kick-off',
  1: 'First Corner',
  2: 'First Yellow Card',
  3: 'Shots',
  4: 'Shots on Target',
  5: 'Fouls',
  6: 'Corner Kicks',
  7: 'Corner Kicks (Extra Time)',
  8: 'Free Kicks',
  9: 'Offsides',
  10: 'Own Goals',
  11: 'Yellow Cards',
  12: 'Yellow Cards (Extra Time)',
  13: 'Red Cards',
  14: 'Possession (%)',
  15: 'Aerial Duels',
  16: 'Saves',
  17: 'Goalkeeper Claims',
  18: 'Dispossessed',
  19: 'Successful Tackles',
  20: 'Interceptions',
  21: 'Long Passes',
  22: 'Short Passes',
  23: 'Assists',
  24: 'Successful Crosses',
  25: 'First Substitution',
  26: 'Last Substitution',
  27: 'First Offside',
  28: 'Last Offside',
  29: 'Substitutions',
  30: 'Last Corner',
  31: 'Last Yellow Card',
  32: 'Substitution (Extra Time)',
  33: 'Offside (Extra Time)',
  34: 'Shots Off Target',
  35: 'Hit the Post',
  36: 'Successful Headers',
  37: 'Blocked Shots',
  38: 'Tackles',
  39: 'Dribbles',
  40: 'Throw-ins',
  41: 'Passes',
  42: 'Pass Accuracy (%)',
  43: 'Attacks',
  44: 'Dangerous Attacks',
  45: 'Corner Kicks (First Half)',
  46: 'Possession (%) (First Half)',
  47: 'Big Chances Created',
  48: 'Big Chances Missed',
  49: 'Shots Inside Box',
  50: 'Shots Outside Box',
  51: 'Duels Won',
  52: 'Expected Goals (xG)',
  53: 'xG From Open Play',
  54: 'xG From Set Pieces',
  55: 'Non-Penalty xG',
  56: 'Expected Goals on Target (xGOT)',
  57: 'Touches in Opposition Box',
  58: 'Accurate Crosses',
  59: 'Ground Duels Won',
  60: 'Aerial Duels Won',
  61: 'Clearances'
};

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

function normalizeStatistics(statistics) {

  if (!Array.isArray(statistics)) {
    return [];
  }

  return statistics.map(stat => {

    const type = Number(stat.type);

    return {

      type: {
        id: type,
        name: STAT_TYPES[type] || `Statistic ${type}`
      },

      home: stat.home ?? null,

      away: stat.away ?? null

    };

  });

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

  const matchId = String(
    req.query?.matchId || ''
  ).trim();

  const date = String(
    req.query?.date || ''
  ).trim();

  if (!/^\d+$/.test(matchId)) {

    return res.status(400).json({

      success: false,

      message: 'A valid matchId is required.'

    });

  }

  if (date && !validDate(date)) {

    return res.status(400).json({

      success: false,

      message: 'Invalid match date.'

    });

  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    10000
  );

  try {

    const url = new URL(
      '/sport/football/stats',
      BASE_URL
    );

    url.searchParams.set('matchId', matchId);

    if (date) {
      url.searchParams.set('date', date);
    }

    url.searchParams.set('api_key', apiKey);

    const response = await fetch(
      url.toString(),
      {

        method: 'GET',

        headers: {
          Accept: 'application/json'
        },

        signal: controller.signal

      }
    );

    const payload = await response.json().catch(
      () => null
    );

    if (!response.ok) {

      console.error('iSports statistics error:', {

        status: response.status,

        message: payload?.message,

        code: payload?.code

      });

      return res.status(response.status).json({

        success: false,

        provider: 'iSports',

        message:
          payload?.message ||
          'iSports statistics request failed.'

      });

    }

    const matches = extractMatches(payload);

    if (!matches) {

      console.error(
        'Unexpected iSports statistics response:',
        payload
      );

      return res.status(502).json({

        success: false,

        provider: 'iSports',

        message: 'Unexpected iSports statistics response format.'

      });

    }

    const match = matches.find(
      item => String(item.matchId) === matchId
    );

    if (!match) {

      return res.status(200).json({

        success: true,

        provider: 'iSports',

        matchId,

        total: 0,

        statistics: []

      });

    }

    const statistics = normalizeStatistics(
      match.stats
    );

    return res.status(200).json({

      success: true,

      provider: 'iSports',

      matchId,

      total: statistics.length,

      statistics

    });

  } catch (error) {

    console.error(
      'OutcomeChad iSports statistics error:',
      error.message
    );

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({

      success: false,

      provider: 'iSports',

      message:
        error.name === 'AbortError'
          ? 'Statistics request timed out.'
          : 'Unable to retrieve match statistics.'

    });

  } finally {

    clearTimeout(timeout);

  }

}