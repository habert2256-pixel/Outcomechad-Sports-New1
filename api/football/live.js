// OutcomeChad Sports
// SportMonks Football Live Scores API
// Route: /api/football/live
// Environment variable: SPORTMONKS_API_TOKEN

const BASE_URL =
  'https://api.sportmonks.com/v3/football/livescores/inplay';

const CACHE_SECONDS = 10;
const STALE_SECONDS = 20;

function pick(...values) {
  return values.find(
    value =>
      value !== null &&
      value !== undefined &&
      value !== ''
  );
}

function getParticipants(match) {
  const participants = Array.isArray(match.participants)
    ? match.participants
    : [];

  const home =
    participants.find(
      item => item.meta?.location === 'home'
    ) || {};

  const away =
    participants.find(
      item => item.meta?.location === 'away'
    ) || {};

  return { home, away };
}

function getScore(match, participantId) {
  const scores = Array.isArray(match.scores)
    ? match.scores
    : [];

  const score = scores
    .filter(item =>
      String(item.participant_id) === String(participantId)
    )
    .sort((a, b) => {
      const aCurrent = a.description === 'CURRENT' ? 1 : 0;
      const bCurrent = b.description === 'CURRENT' ? 1 : 0;

      return bCurrent - aCurrent;
    })[0];

  return score?.score?.goals ?? null;
}

function getClock(match) {
  const periods = Array.isArray(match.periods)
    ? match.periods
    : [];

  const activePeriod = periods.find(
    period => period.ticking === true
  );

  if (activePeriod) {
    const minutes = Number(activePeriod.minutes || 0);
    const added = Number(activePeriod.time_added || 0);

    return {
      minute:
        added > 0
          ? `${minutes}+${added}`
          : minutes,

      seconds: Number(activePeriod.seconds || 0)
    };
  }

  return {
    minute: null,
    seconds: null
  };
}

function getStatus(match) {
  const state = String(
    pick(
      match.state?.name,
      match.state?.state,
      match.status,
      ''
    )
  ).toLowerCase();

  if (
    /half.?time|halftime|^ht$/.test(state)
  ) {
    return {
      status: 'LIVE',
      statusText: 'HT'
    };
  }

  if (
    /after.?penalt|penalty shootout|^pen$/.test(state)
  ) {
    return {
      status: 'LIVE',
      statusText: 'PEN'
    };
  }

  if (
    /extra.?time/.test(state)
  ) {
    return {
      status: 'LIVE',
      statusText: 'ET'
    };
  }

  if (
    /finish|full.?time|ended|^ft$/.test(state)
  ) {
    return {
      status: 'FINISHED',
      statusText: 'FT'
    };
  }

  if (
    /live|in.?play|playing|1st|2nd|break/.test(state)
  ) {
    return {
      status: 'LIVE',
      statusText: 'LIVE'
    };
  }

  return {
    status: 'LIVE',
    statusText: state || 'LIVE'
  };
}

function normalizeMatch(match) {
  const { home, away } = getParticipants(match);

  const clock = getClock(match);
  const status = getStatus(match);

  const league = match.league || {};
  const venue = match.venue || {};

  return {
    id: match.id,

    home: {
      id: home.id || null,
      name: home.name || 'Home',
      logo: home.image_path || null,
      score: getScore(match, home.id)
    },

    away: {
      id: away.id || null,
      name: away.name || 'Away',
      logo: away.image_path || null,
      score: getScore(match, away.id)
    },

    homeName: home.name || 'Home',
    awayName: away.name || 'Away',

    homeTeamId: home.id || null,
    awayTeamId: away.id || null,

    homeLogo: home.image_path || null,
    awayLogo: away.image_path || null,

    homeScore: getScore(match, home.id),
    awayScore: getScore(match, away.id),

    competitionName: league.name || 'Football',

    league: {
      id: league.id || null,
      name: league.name || 'Football',
      image_path: league.image_path || null
    },

    leagueId: league.id || null,
    leagueLogo: league.image_path || null,

    starting_at: match.starting_at || null,
    startingAt: match.starting_at || null,

    status: status.status,
    statusName: status.statusText,

    minute: clock.minute,
    addedTime: null,
    seconds: clock.seconds,

    venue: venue.name || null,

    state: match.state || null,

    participants: match.participants || [],
    scores: match.scores || [],
    periods: match.periods || [],

    raw: match
  };
}

export default async function handler(req, res) {
  res.setHeader(
    'Cache-Control',
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      success: false,
      error: 'SPORTMONKS_API_TOKEN is not configured.'
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    const url = new URL(BASE_URL);

    url.searchParams.set('api_token', token);

    url.searchParams.set(
      'include',
      'participants;scores;league;state;venue;periods'
    );

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('SportMonks live error:', {
        status: response.status,
        message: payload?.message,
        errors: payload?.errors
      });

      return res.status(response.status).json({
        success: false,
        error: 'Could not load live football scores.',
        message:
          payload?.message ||
          'SportMonks live request failed.'
      });
    }

    const matches = Array.isArray(payload?.data)
      ? payload.data
      : [];

    const normalized = matches.map(normalizeMatch);

    return res.status(200).json({
      success: true,
      provider: 'SportMonks',
      total: normalized.length,
      data: normalized
    });

  } catch (error) {
    console.error('Live API handler error:', error);

    if (error.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        error: 'Live scores request timed out.'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal live scores API error.'
    });

  } finally {
    clearTimeout(timeout);
  }
}