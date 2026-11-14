// OutcomeChad Sports
// SportMonks Football Live Scores
// Endpoint: /api/football/live

const CACHE_SECONDS = 10;
const STALE_SECONDS = 20;

function getArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function pick(...values) {
  return values.find(v => v !== null && v !== undefined && v !== '') ?? null;
}

function getCurrentScores(scores = []) {
  const result = { home: null, away: null };

  for (const item of Array.isArray(scores) ? scores : []) {
    if (String(item.description || '').toUpperCase() !== 'CURRENT') continue;

    const score = Array.isArray(item.score) ? item.score : [item.score];

    for (const entry of score) {
      if (!entry) continue;

      const side = String(entry.participant || '').toLowerCase();

      if (side === 'home') result.home = entry.goals ?? null;
      if (side === 'away') result.away = entry.goals ?? null;
    }
  }

  return result;
}

function getMatchTime(fixture) {
  const time = fixture.time || {};

  const periods = Array.isArray(fixture.periods)
    ? fixture.periods
    : [];

  const activePeriod =
    periods.find(p => p.ticking === true) ||
    periods.find(p => p.is_current === true) ||
    {};

  return {
    minute: pick(
      time.minute,
      activePeriod.minute,
      fixture.minute
    ),

    addedTime: pick(
      time.added_time,
      time.injury_time,
      activePeriod.added_time,
      activePeriod.injury_time
    ),

    extraMinute: pick(
      time.extra_minute,
      activePeriod.extra_minute
    )
  };
}

function getStatus(fixture) {
  const raw = String(
    pick(
      fixture.state?.name,
      fixture.state?.short_name,
      fixture.state?.developer_name,
      fixture.state?.state,
      fixture.status,
      ''
    )
  ).toLowerCase();

  if (/half.?time|halftime|^ht$/.test(raw)) return 'HT';

  if (/after.?extra|aet/.test(raw)) return 'AET';

  if (/penalt/.test(raw)) return 'PEN';

  if (/finish|full.?time|^ft$|ended/.test(raw)) return 'FT';

  if (/live|in.?play|playing|extra.?time|^1st$|^2nd$/.test(raw)) {
    return 'LIVE';
  }

  if (/not.?started|scheduled|^ns$/.test(raw)) return 'NS';

  return raw.toUpperCase() || 'LIVE';
}

function normalizeFixture(fixture) {
  const participants = Array.isArray(fixture.participants)
    ? fixture.participants
    : [];

  const home = participants.find(
    team => String(team.meta?.location).toLowerCase() === 'home'
  );

  const away = participants.find(
    team => String(team.meta?.location).toLowerCase() === 'away'
  );

  const scores = getCurrentScores(fixture.scores);
  const matchTime = getMatchTime(fixture);
  const status = getStatus(fixture);

  return {
    id: fixture.id,

    homeName: home?.name || home?.short_code || 'TBD',
    awayName: away?.name || away?.short_code || 'TBD',

    homeTeamId: home?.id || null,
    awayTeamId: away?.id || null,

    homeLogo: home?.image_path || null,
    awayLogo: away?.image_path || null,

    homeScore: scores.home,
    awayScore: scores.away,

    status,
    statusName: fixture.state?.name || status,

    minute: matchTime.minute,
    addedTime: matchTime.addedTime,
    extraMinute: matchTime.extraMinute,

    state: fixture.state || null,

    league: fixture.league?.name || 'Unknown',
    leagueId: fixture.league?.id || null,
    leagueLogo: fixture.league?.image_path || null,

    country: fixture.league?.country?.name || null,

    venue: fixture.venue?.name || null,

    startingAt: fixture.starting_at || null,

    rawTime: fixture.time || null
  };
}

export default async function handler(req, res) {
  res.setHeader(
    'Cache-Control',
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      success: false,
      message: 'SPORTMONKS_API_TOKEN is missing in Vercel.'
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const url = new URL(
      'https://api.sportmonks.com/v3/football/livescores/inplay'
    );

    url.searchParams.set('api_token', token);

    url.searchParams.set(
      'include',
      'participants;scores;league;state;venue;league.country;periods'
    );

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('SportMonks live error:', payload);

      return res.status(response.status).json({
        success: false,
        message: payload?.message || 'SportMonks live-score request failed.'
      });
    }

    const matches = getArray(payload)
      .map(normalizeFixture);

    return res.status(200).json({
      success: true,
      data: matches,
      total: matches.length
    });

  } catch (error) {
    console.error('Live API error:', error.message);

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({
      success: false,
      message: error.name === 'AbortError'
        ? 'SportMonks request timed out.'
        : 'Unable to connect to SportMonks.'
    });

  } finally {
    clearTimeout(timeout);
  }
}