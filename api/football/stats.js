// OutcomeChad Sports
// API Ninjas — Match Statistics Compatibility
// Route: /api/football/stats?matchId=123&date=YYYY-MM-DD
// Environment: API_NINJAS_KEY

const CACHE_SECONDS = 30;
const STALE_SECONDS = 30;

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

  const apiKey = process.env.API_NINJAS_KEY;

  if (!apiKey) {

    return res.status(500).json({

      success: false,
      provider: 'API Ninjas',

      message: 'API_NINJAS_KEY is missing in Vercel.'

    });

  }

  const matchId = String(
    req.query?.matchId || ''
  ).trim();

  const date = String(
    req.query?.date || ''
  ).trim();

  if (!matchId || matchId.length > 150) {

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

  // API Ninjas Soccer API does not document
  // a dedicated detailed match-statistics endpoint.
  // Do not fabricate statistics.

  return res.status(200).json({

    success: true,

    provider: 'API Ninjas',

    matchId,

    available: false,

    total: 0,

    statistics: [],

    message:
      'Detailed match statistics are not available through the configured API Ninjas Soccer integration.'

  });

}