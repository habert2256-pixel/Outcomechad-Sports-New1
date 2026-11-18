// OutcomeChad Sports
// SportMonks Football Match Analysis API v3
// Route: /api/football/match-data?matchId=19895742
// Environment: SPORTMONKS_API_TOKEN

const BASE_URL = 'https://api.sportmonks.com/v3/football';

const CACHE_SECONDS = 60;
const STALE_SECONDS = 120;

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
    res.setHeader('Allow', 'GET');

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const matchId = String(req.query.matchId || '').trim();

  if (!/^\d+$/.test(matchId)) {
    return res.status(400).json({
      success: false,
      error: 'A valid numeric matchId is required.'
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
  }, 20000);

  try {
    const url = new URL(
      `${BASE_URL}/fixtures/${matchId}`
    );

    url.searchParams.set('api_token', token);

    url.searchParams.set(
      'include',
      [
        'participants',
        'league',
        'state',
        'scores',
        'venue',
        'statistics.type',
        'events.type',
        'lineups.player',
        'lineups.position',
        'formations'
      ].join(';')
    );

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('SportMonks match analysis error:', {
        status: response.status,
        message: payload?.message
      });

      return res.status(502).json({
        success: false,
        provider: 'SportMonks',
        matchId,
        error: 'Unable to retrieve match analysis.',
        message: payload?.message || `HTTP ${response.status}`
      });
    }

    const fixture = payload?.data;

    if (!fixture?.id) {
      return res.status(404).json({
        success: false,
        provider: 'SportMonks',
        matchId,
        error: 'Match not found.'
      });
    }

    const participants = Array.isArray(fixture.participants)
      ? fixture.participants
      : [];

    const statistics = Array.isArray(fixture.statistics)
      ? fixture.statistics
      : [];

    const events = Array.isArray(fixture.events)
      ? fixture.events
      : [];

    const lineups = Array.isArray(fixture.lineups)
      ? fixture.lineups
      : [];

    const formations = Array.isArray(fixture.formations)
      ? fixture.formations
      : [];

    const home = participants.find(
      team => team.meta?.location === 'home'
    );

    const away = participants.find(
      team => team.meta?.location === 'away'
    );

    const state = fixture.state || null;
    const league = fixture.league || null;
    const venue = fixture.venue || null;

    return res.status(200).json({
      success: true,
      provider: 'SportMonks',
      matchId,

      available: {
        match: true,
        participants: participants.length > 0,
        statistics: statistics.length > 0,
        events: events.length > 0,
        lineups: lineups.length > 0,
        formations: formations.length > 0,
        scores: Array.isArray(fixture.scores) &&
          fixture.scores.length > 0
      },

      data: {
        match: {
          id: fixture.id,
          name: fixture.name || null,
          startingAt: fixture.starting_at || null,
          resultInfo: fixture.result_info || null,

          status: state?.name || null,
          statusCode: state?.state || null,

          league: league ? {
            id: league.id,
            name: league.name,
            logo: league.image_path || null
          } : null,

          home: home || null,
          away: away || null,

          scores: fixture.scores || [],

          venue: venue || null
        },

        statistics,
        events,
        lineups,
        formations
      },

      totals: {
        statistics: statistics.length,
        events: events.length,
        lineups: lineups.length,
        formations: formations.length
      }
    });

  } catch (error) {
    console.error('Match analysis error:', error.message);

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({
      success: false,
      provider: 'SportMonks',
      matchId,
      error: error.name === 'AbortError'
        ? 'Match analysis request timed out.'
        : 'Unable to retrieve match analysis.'
    });

  } finally {
    clearTimeout(timeout);
  }
}