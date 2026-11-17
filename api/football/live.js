// OutcomeChad Sports
// Football-Data API — Live Football Scores
// Route: /api/football/live
// Environment variable: FOOTBALL_DATA_API_TOKEN
const BASE_URL =
  'https://api.football-data.org/v4/matches';
const CACHE_SECONDS = 10;
const STALE_SECONDS = 20;
function normalizeMatch(match) {
  const home = match.homeTeam || {};
  const away = match.awayTeam || {};
  const competition = match.competition || {};
  const score = match.score || {};
  const fullTime = score.fullTime || {};
  const halfTime = score.halfTime || {};
  const rawStatus = String(
    match.status || ''
  ).toUpperCase();
  let statusText = 'LIVE';
  if (rawStatus === 'PAUSED') {
    statusText = 'HT';
  } else if (rawStatus === 'EXTRA_TIME') {
    statusText = 'ET';
  } else if (rawStatus === 'PENALTY_SHOOTOUT') {
    statusText = 'PEN';
  } else if (rawStatus === 'IN_PLAY') {
    statusText = 'LIVE';
  }
  return {
    id: String(match.id),
    home: {
      id: home.id || null,
      name: home.name || 'Home',
      logo: home.crest || null,
      score: fullTime.home ?? null
    },
    away: {
      id: away.id || null,
      name: away.name || 'Away',
      logo: away.crest || null,
      score: fullTime.away ?? null
    },
    homeName: home.name || 'Home',
    awayName: away.name || 'Away',
    homeTeamId: home.id || null,
    awayTeamId: away.id || null,
    homeLogo: home.crest || null,
    awayLogo: away.crest || null,
    homeScore: fullTime.home ?? null,
    awayScore: fullTime.away ?? null,
    halfTimeHome: halfTime.home ?? null,
    halfTimeAway: halfTime.away ?? null,
    competitionName:
      competition.name || 'Football',
    league: {
      id: competition.id || null,
      name: competition.name || 'Football',
      emblem: competition.emblem || null
    },
    leagueId: competition.id || null,
    leagueLogo: competition.emblem || null,
    country: competition.area?.name || '',
    starting_at: match.utcDate || null,
    startingAt: match.utcDate || null,
    matchTime: match.utcDate || null,
    status: 'LIVE',
    statusName: statusText,
    minute: null,
    addedTime: null,
    seconds: null,
    venue: match.venue || null,
    stageName: match.stage || '',
    groupName: match.group || '',
    roundName: match.matchday
      ? `Matchday ${match.matchday}`
      : '',
    raw: match
  };
}
export default async function handler(req, res) {
  res.setHeader(
    'Cache-Control',
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );
  res.setHeader(
    'Access-Control-Allow-Origin',
    '*'
  );
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
      message: 'Method not allowed.'
    });
  }
  const token =
    process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) {
    return res.status(500).json({
      success: false,
      provider: 'Football-Data',
      message: 'FOOTBALL_DATA_API_TOKEN is not configured.'
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 15000);
  try {
    const url = new URL(BASE_URL);
    // Football-Data live match statuses
    url.searchParams.set(
      'status',
      'IN_PLAY,PAUSED'
    );
    const response = await fetch(
      url.toString(),
      {
        method: 'GET',
        headers: {
          'X-Auth-Token': token,
          'Accept': 'application/json'
        },
        signal: controller.signal
      }
    );
    const payload = await response.json().catch(
      () => null
    );
    if (!response.ok) {
      console.error(
        'Football-Data live error:',
        {
          status: response.status,
          message: payload?.message
        }
      );
      return res.status(response.status).json({
        success: false,
        provider: 'Football-Data',
        message:
          payload?.message ||
          'Could not load live football scores.',
        code: response.status
      });
    }
    const matches = Array.isArray(payload?.matches)
      ? payload.matches
      : [];
    const normalized = matches.map(normalizeMatch);
    return res.status(200).json({
      success: true,
      provider: 'Football-Data',
      total: normalized.length,
      data: normalized
    });
  } catch (error) {
    console.error(
      'Football-Data live handler error:',
      error.message
    );
    if (error.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        provider: 'Football-Data',
        message: 'Live scores request timed out.'
      });
    }
    return res.status(502).json({
      success: false,
      provider: 'Football-Data',
      message: 'Internal live scores API error.'
    });
  } finally {
    clearTimeout(timeout);
  }
}