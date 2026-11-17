// OutcomeChad Sports
// iSports Football Transfers API
// Route: /api/football/transfers
// Environment: ISPORTS_API_KEY
//
// Official endpoint:
// /sport/football/transfer
const BASE_URL = 'https://api.isportsapi.com';
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
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }
  const apiKey = process.env.ISPORTS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      provider: 'iSports',
      error: 'ISPORTS_API_KEY is not configured.'
    });
  }
  const requestedDays = Number(req.query.day || 30);
  const day = Number.isInteger(requestedDays)
    ? Math.min(Math.max(requestedDays, 1), 730)
    : 30;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 20000);
  try {
    const url = new URL(
      '/sport/football/transfer',
      BASE_URL
    );
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('day', String(day));
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error('iSports transfer HTTP error:', {
        status: response.status,
        message: payload?.message
      });
      return res.status(502).json({
        success: false,
        provider: 'iSports',
        error: 'Unable to retrieve transfer records.',
        message: payload?.message || `HTTP ${response.status}`
      });
    }
    if (!payload || typeof payload !== 'object') {
      return res.status(502).json({
        success: false,
        provider: 'iSports',
        error: 'Invalid response from iSports.'
      });
    }
    // Check iSports API-level errors.
    if (
      payload.code !== undefined &&
      Number(payload.code) !== 0
    ) {
      return res.status(502).json({
        success: false,
        provider: 'iSports',
        error: payload.message || 'iSports transfer request failed.',
        upstreamCode: payload.code
      });
    }
    const records =
      Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.data?.list)
        ? payload.data.list
        : [];
    const normalized = records.map(item => {
      const playerId = item.playerId || null;
      const fromTeamId = item.fromTeamId || null;
      const toTeamId = item.toTeamId || null;
      const transferTimestamp = Number(
        item.transferTime || 0
      );
      const expiryTimestamp = Number(
        item.endTime || 0
      );
      const modifyTimestamp = Number(
        item.modifyTime || 0
      );
      const money = Number(item.money || 0);
      const amount = money > 0
        ? money * 1000
        : null;
      const transferDate = transferTimestamp > 0
        ? new Date(
            transferTimestamp * 1000
          ).toISOString()
        : null;
      const expiryDate = expiryTimestamp > 0
        ? new Date(
            expiryTimestamp * 1000
          ).toISOString()
        : null;
      return {
        id: String(
          item.recordId || playerId || Math.random()
        ),
        recordId: item.recordId || null,
        player_id: playerId,
        player: {
          id: playerId,
          name: playerId
            ? `Player ${playerId}`
            : 'Player information unavailable',
          image_path: null,
          photo: null
        },
        from_team_id: fromTeamId,
        fromteam: {
          id: fromTeamId,
          name: item.fromTeam || 'Not reported',
          image_path: null
        },
        to_team_id: toTeamId,
        toteam: {
          id: toTeamId,
          name: item.toTeam || 'Not reported',
          image_path: null
        },
        probability: 'Not specified',
        amount,
        currency: amount !== null ? 'EUR' : null,
        feeInThousands: money || null,
        date: transferDate,
        endTime: expiryDate,
        season: item.season || null,
        type: {
          name: item.type || 'Transfer',
          code: item.type || null
        },
        source_name: 'iSports',
        source_url: null,
        completed: transferTimestamp > 0,
        modifyTime: modifyTimestamp > 0
          ? new Date(
              modifyTimestamp * 1000
            ).toISOString()
          : null
      };
    });
    return res.status(200).json({
      success: true,
      provider: 'iSports',
      type: 'transfer_records',
      total: normalized.length,
      day,
      data: normalized
    });
  } catch (error) {
    console.error(
      'iSports transfer API error:',
      error.message
    );
    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({
      success: false,
      provider: 'iSports',
      error:
        error.name === 'AbortError'
          ? 'iSports transfer request timed out.'
          : 'Unable to retrieve transfer records.'
    });
  } finally {
    clearTimeout(timeout);
  }
}