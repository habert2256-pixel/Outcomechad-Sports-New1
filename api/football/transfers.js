// OutcomeChad Sports
// SportMonks Transfer Rumours + Confirmed Transfers API
// Endpoint: /api/football/transfers
//
// Returns:
//   rumours   - Potential transfers
//   completed - Completed transfer records
//   data      - Backward-compatible alias for rumours
//
// Required Vercel environment variable:
//   SPORTMONKS_API_TOKEN

const BASE_URL = ‘https://api.sportmonks.com/v3/football’;

const PER_PAGE = 50;
const MAX_PAGES = 3;
const REQUEST_TIMEOUT = 12000;

const INCLUDE = ‘player;fromTeam;toTeam;type’;

async function fetchTransferFeed(endpoint, token) {
const records = [];
let hasMore = true;
let pagesFetched = 0;

for (let page = 1; page <= MAX_PAGES && hasMore; page++) {
const url = new URL(${BASE_URL}/${endpoint});

url.searchParams.set('api_token', token);
url.searchParams.set('include', INCLUDE);
url.searchParams.set('per_page', String(PER_PAGE));
url.searchParams.set('order', 'desc');
url.searchParams.set('page', String(page));
const controller = new AbortController();
const timeout = setTimeout(
  () => controller.abort(),
  REQUEST_TIMEOUT
);
let response;
let payload;
try {
  response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    },
    signal: controller.signal
  });
  payload = await response.json().catch(() => null);
} finally {
  clearTimeout(timeout);
}
if (!response.ok) {
  const error = new Error(
    payload?.message ||
    `SportMonks returned HTTP ${response.status}`
  );
  error.status = response.status;
  throw error;
}
const pageRecords = Array.isArray(payload?.data)
  ? payload.data
  : [];
records.push(...pageRecords);
pagesFetched++;
const pagination =
  payload?.pagination ||
  payload?.meta?.pagination ||
  {};
hasMore = pagination.has_more === true;

}

return {
data: records,
total: records.length,
pagesFetched,
hasMore
};
}

export default async function handler(req, res) {
res.setHeader(
‘Cache-Control’,
‘s-maxage=300, stale-while-revalidate=600’
);

res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);

if (req.method === ‘OPTIONS’) {
return res.status(200).end();
}

if (req.method !== ‘GET’) {
return res.status(405).json({
success: false,
error: ‘Method not allowed’
});
}

const token = process.env.SPORTMONKS_API_TOKEN;

if (!token) {
return res.status(500).json({
success: false,
error: ‘SPORTMONKS_API_TOKEN is not configured’
});
}

try {
const [rumoursResult, completedResult] =
await Promise.allSettled([
fetchTransferFeed(‘transfer-rumours’, token),
fetchTransferFeed(‘transfers’, token)
]);

const rumours =
  rumoursResult.status === 'fulfilled'
    ? rumoursResult.value
    : null;
const completed =
  completedResult.status === 'fulfilled'
    ? completedResult.value
    : null;
const errors = {};
if (!rumours) {
  errors.rumours =
    rumoursResult.reason?.message ||
    'Could not load transfer rumours';
}
if (!completed) {
  errors.completed =
    completedResult.reason?.message ||
    'Could not load completed transfers';
}
if (!rumours && !completed) {
  console.error('Both SportMonks transfer feeds failed:', errors);
  return res.status(502).json({
    success: false,
    error: 'Could not load transfer feeds',
    details: errors
  });
}
return res.status(200).json({
  success: true,
  provider: 'SportMonks',
  rumours: rumours?.data || [],
  completed: completed?.data || [],
  totals: {
    rumours: rumours?.total || 0,
    completed: completed?.total || 0
  },
  pagination: {
    rumours: {
      pagesFetched: rumours?.pagesFetched || 0,
      hasMore: rumours?.hasMore || false
    },
    completed: {
      pagesFetched: completed?.pagesFetched || 0,
      hasMore: completed?.hasMore || false
    }
  },
  // Keeps older website code working.
  data: rumours?.data || [],
  total: rumours?.total || 0,
  ...(Object.keys(errors).length > 0
    ? { partialErrors: errors }
    : {})
});

} catch (error) {
console.error(‘Transfers API error:’, error);

return res.status(
  error.name === 'AbortError' ? 504 : 502
).json({
  success: false,
  error: 'Could not load transfer information',
  message: error.message
});

}
}