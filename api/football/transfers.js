// OutcomeChad Sports
// SportMonks Transfer Rumours API
// Endpoint: /api/football/transfers

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');

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
      error: 'SPORTMONKS_API_TOKEN is not configured'
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const url = new URL(
      'https://api.sportmonks.com/v3/football/transfer-rumours'
    );

    url.searchParams.set('api_token', token);

    url.searchParams.set(
      'include',
      'player;fromTeam;toTeam;type'
    );

    url.searchParams.set('per_page', '50');
    url.searchParams.set('order', 'desc');

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('SportMonks transfer error:', payload);

      return res.status(response.status).json({
        success: false,
        error: 'Could not load transfer rumours',
        message: payload?.message || 'SportMonks request failed.'
      });
    }

    const transfers = Array.isArray(payload?.data)
      ? payload.data
      : [];

    return res.status(200).json({
      success: true,
      total: transfers.length,
      data: transfers
    });

  } catch (error) {
    console.error('Transfer API error:', error.message);

    return res.status(
      error.name === 'AbortError' ? 504 : 502
    ).json({
      success: false,
      error: 'Could not load transfer rumours',
      message: error.message
    });

  } finally {
    clearTimeout(timeout);
  }
}