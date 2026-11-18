// OutcomeChad Sports
// Combined Match Data API
// Provider: SportMonks Football API v3
// Endpoint: /api/football/match-data?matchId=XXXX
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
      message: 'Method not allowed'
    });
  }

  const matchId = String(req.query?.matchId || '').trim();

  if (!matchId || !/^\d+$/.test(matchId)) {
    return res.status(400).json({
      success: false,
      provider: 'SportMonks',
      message: 'A valid numeric matchId is required.'
    });
  }

  const apiToken = process.env.SPORTMONKS_API_TOKEN;

  if (!apiToken) {
    return res.status(500).json({
      success: false,
      provider: 'SportMonks',
      error: 'SPORTMONKS_API_TOKEN is not configured.'
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 20000);

  try {
    const url = new URL(
      `${BASE_URL}/fixtures/${encodeURIComponent(matchId)}`
    );

    url.searchParams.set('api_token', apiToken);
    url.searchParams.set(
      'include',
      'participants;league;state;scores;venue'
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
      console.error('SportMonks match-data error:', {
        status: response.status,
        message: payload?.message
      });

      return res.status(502).json({
        success: false,
        provider: 'SportMonks',
        matchId,
        error: 'Unable to retrieve match information.',
        message: payload?.message || `HTTP ${response.status}`
      });
    }

    const fixture = payload?.data;

    if (!fixture || !fixture.id) {
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

    const home = participants.find(
      team => team.meta?.location === 'home'
    );

    const away = participants.find(
      team => team.meta?.location === 'away'
    );

    const state = Array.isArray(fixture.state)
      ? fixture.state[0]
      : fixture.state;

    const league = Array.isArray(fixture.league)
      ? fixture.league[0]
      : fixture.league;

    const venue = Array.isArray(fixture.venue)
      ? fixture.venue[0]
      : fixture.venue;

    const scores = Array.isArray(fixture.scores)
      ? fixture.scores
      : [];

    const match = {
      id: fixture.id,
      name: fixture.name || null,
      startingAt: fixture.starting_at || null,
      status: state?.name || null,
      statusShort: state?.short_name || null,

      league: league
        ? {
            id: league.id,
            name: league.name,
            imagePath: league.image_path || null
          }
        : null,

      homeTeam: home
        ? {
            id: home.id,
            name: home.name,
            imagePath: home.image_path || null
          }
        : null,

      awayTeam: away
        ? {
            id: away.id,
            name: away.name,
            imagePath: away.image_path || null
          }
        : null,

      scores,

      venue: venue
        ? {
            id: venue.id,
            name: venue.name,
            city: venue.city_name || null
          }
        : null
    };

    const data = {
      matchId,

      match,

      odds: {
        available: false,

        preMatch: {
          odds: [],
          byMarket: {}
        },

        inPlay: {
          odds: [],
          byMarket: {}
        },

        message:
          'Bookmaker odds are not included in this match-data endpoint.'
      },

      predictions: {
        available: false,
        fulltimeResult: null,
        btts: null,
        all: [],

        message:
          'Betting predictions are not included in this match-data endpoint.'
      }
    };

    return res.status(200).json({
      success: true,
      provider: 'SportMonks',
      matchId,
      available: true,
      data
    });

  } catch (error) {
    console.error('SportMonks match-data error:', error.message);

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({
      success: false,
      provider: 'SportMonks',
      matchId,
      error:
        error.name === 'AbortError'
          ? 'SportMonks request timed out.'
          : 'Unable to retrieve match information.'
    });

  } finally {
    clearTimeout(timeout);
  }
}