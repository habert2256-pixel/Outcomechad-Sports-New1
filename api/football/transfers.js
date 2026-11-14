// OutcomeChad Sports
// SportMonks Football Transfer Rumours API
// Route: /api/football/transfers
// Environment variable: SPORTMONKS_API_TOKEN

const BASE_URL =
  'https://api.sportmonks.com/v3/football/transfer-rumours';

const CACHE_SECONDS = 300;
const STALE_SECONDS = 600;

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

    // SportMonks transfer-rumours relationships.
    url.searchParams.set(
      'include',
      'player;fromTeam;toTeam;type'
    );

    url.searchParams.set('per_page', '50');
    url.searchParams.set('order', 'desc');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('SportMonks transfer error:', {
        status: response.status,
        message: payload?.message,
        errors: payload?.errors
      });

      const message =
        payload?.message ||
        payload?.errors?.[0]?.message ||
        'SportMonks transfer request failed.';

      return res.status(response.status).json({
        success: false,
        error:
          response.status === 403
            ? 'SportMonks access denied. Check whether this API token has transfer-rumours access.'
            : 'Unable to retrieve transfer rumours.',
        message
      });
    }

    const transfers = Array.isArray(payload?.data)
      ? payload.data
      : [];

    const normalized = transfers.map(item => {
      const player = item.player || {};
      const from = item.fromteam || item.fromTeam || {};
      const to = item.toteam || item.toTeam || {};
      const type = item.type || {};

      return {
        id: item.id,

        player_id: item.player_id,

        player: {
          id: player.id || item.player_id,
          name:
            player.display_name ||
            player.name ||
            [
              player.firstname,
              player.lastname
            ].filter(Boolean).join(' ') ||
            'Player information unavailable',

          image_path:
            player.image_path ||
            player.image ||
            null
        },

        from_team_id: item.from_team_id,

        fromteam: {
          id: from.id || item.from_team_id,
          name: from.name || 'Not reported',
          image_path:
            from.image_path ||
            from.logo ||
            null
        },

        to_team_id: item.to_team_id,

        toteam: {
          id: to.id || item.to_team_id,
          name: to.name || 'Not reported',
          image_path:
            to.image_path ||
            to.logo ||
            null
        },

        probability: item.probability || 'Not specified',

        amount: item.amount ?? null,
        currency: item.currency || null,

        date: item.date || null,

        type: {
          name: type.name || 'Transfer',
          code: type.code || null
        },

        source_name:
          item.source_name ||
          'Source not reported',

        source_url:
          item.source_url ||
          null,

        completed: false
      };
    });

    return res.status(200).json({
      success: true,
      provider: 'SportMonks',
      type: 'transfer_rumours',
      total: normalized.length,
      hasMore: Boolean(payload?.pagination?.has_more),
      data: normalized
    });

  } catch (error) {
    console.error('Transfer API handler error:', error);

    if (error.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        error: 'SportMonks transfer request timed out.'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal transfer API error.'
    });

  } finally {
    clearTimeout(timeout);
  }
}