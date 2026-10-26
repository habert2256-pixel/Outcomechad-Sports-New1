# OutcomeChad Sports API starter

This starter creates these Vercel serverless routes:

- `GET /api/football/live`
- `GET /api/basketball/live`

## Required Vercel environment variables

- `ISPORTS_API_KEY` — your private iSports key
- `ISPORTS_FOOTBALL_URL` — the exact live football endpoint from your iSports API product documentation
- `ISPORTS_BASKETBALL_URL` — the exact live basketball endpoint from your iSports API product documentation

Set them in Vercel Project → Settings → Environment Variables, for Production (and Preview if needed), then redeploy.

## Important

iSports offers different products and endpoint/authentication formats. Do not guess the endpoint or auth header. The sample handlers currently use `Authorization: Bearer ...`; confirm this matches the documentation for your particular account before relying on it. If your plan does not include basketball data, that endpoint requires a separate supported provider or plan.

Keep the API key out of browser JavaScript, GitHub files, screenshots, and chat messages.
