// OutcomeChad Sports
// iSports API — Football Match Events
// Route: /api/football/events
// Environment: ISPORTS_API_KEY

const BASE_URL = 'https://api.isportsapi.com';

const CACHE_SECONDS = 15;
const STALE_SECONDS = 30;

const EVENT_TYPES = {
  1: 'Goal',
  2: 'Red Card',
  3: 'Yellow Card',
  7: 'Penalty Scored',
  8: 'Own Goal',
  9: 'Second Yellow Card',
  11: 'Substitution',
  13: 'Penalty Missed',
  14: 'VAR Review'
};

function extractEvents(payload) {

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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {

    return res.status(400).json({
      success: false,
      message: 'A valid match date is required.'
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
    10000
  );

  try {

    const url = new URL(
      '/sport/football/events',
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

      return res.status(response.status).json({

        success: false,
        provider: 'iSports',

        message:
          payload?.message ||
          'iSports events request failed.'

      });

    }

    const matches = extractEvents(payload);

    if (!matches) {

      return res.status(502).json({

        success: false,
        provider: 'iSports',

        message: 'Unexpected iSports events response format.'

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
        events: []

      });

    }

    const events = Array.isArray(match.events)
      ? match.events
      : [];

    const normalized = events.map(event => ({

      id: String(event.eventId || ''),

      minute: event.minute ?? null,

      type: {
        id: event.type,
        name: EVENT_TYPES[Number(event.type)] || 'Match Event'
      },

      type_name:
        EVENT_TYPES[Number(event.type)] || 'Match Event',

      playerName: event.playerName || '',

      player_name: event.playerName || '',

      playerId: event.playerId || '',

      assistPlayerId: event.assistPlayerId || '',

      overtime: event.overtime ?? 0,

      homeEvent: event.homeEvent === true,

      penalty: Array.isArray(event.penalty)
        ? event.penalty
        : []

    }));

    return res.status(200).json({

      success: true,

      provider: 'iSports',

      matchId,

      total: normalized.length,

      events: normalized

    });

  } catch (error) {

    console.error(
      'iSports events error:',
      error.message
    );

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({

      success: false,

      provider: 'iSports',

      message:
        error.name === 'AbortError'
          ? 'iSports events request timed out.'
          : 'Unable to retrieve match events.'

    });

  } finally {

    clearTimeout(timeout);

  }

}