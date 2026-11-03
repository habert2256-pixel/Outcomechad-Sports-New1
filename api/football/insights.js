// Vercel serverless route: /api/football/insights.js
// Uses Sportmonks Football API v3.
// Keep SPORTMONKS_API_TOKEN server-side.

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;
  const matchId = String(req.query.matchId || "").trim();

  if (!token) {
    return res.status(500).json({
      error: "SPORTMONKS_API_TOKEN is not configured"
    });
  }

  if (!/^\d+$/.test(matchId)) {
    return res.status(400).json({
      error: "A valid matchId is required"
    });
  }

  const api = "https://api.sportmonks.com/v3/football";
  const query = new URLSearchParams({
    api_token: token
  });

  async function sportmonks(path, params = {}) {
    const url = new URL(`${api}${path}`);
    const q = new URLSearchParams(query);

    for (const [key, value] of Object.entries(params)) {
      q.set(key, String(value));
    }

    url.search = q.toString();

    const response = await fetch(url.toString());

    let payload = {};

    try {
      payload = await response.json();
    } catch {}

    if (!response.ok) {
      const message =
        payload?.message ||
        payload?.error ||
        `Sportmonks returned ${response.status}`;

      throw new Error(message);
    }

    return payload?.data ?? [];
  }

  function list(value) {
    if (Array.isArray(value)) return value;

    if (value && Array.isArray(value.data)) {
      return value.data;
    }

    return [];
  }

  function participants(fixture) {
    return list(fixture?.participants);
  }

  function teamIdFor(participant) {
    return String(
      participant?.id ??
      participant?.participant_id ??
      ""
    );
  }

  function side(participant) {
    return String(
      participant?.meta?.location ||
      participant?.location ||
      ""
    ).toLowerCase();
  }

  function scoreFor(fixture, teamId) {
    const scores = list(fixture?.scores);

    const score =
      scores.find(item => {
        const id = String(
          item?.participant_id ??
          item?.participant?.id ??
          ""
        );

        const description = String(
          item?.description ||
          item?.type?.description ||
          ""
        ).toLowerCase();

        return (
          id === teamId &&
          /current|final|full.?time|2nd.?half/.test(description)
        );
      }) ||
      scores.find(item =>
        String(item?.participant_id ?? "") === teamId
      );

    const value =
      score?.score?.goals ??
      score?.score ??
      score?.goals ??
      score?.value;

    return value === undefined || value === null
      ? null
      : Number(value);
  }

  function teamForm(fixtures, teamId) {
    return list(fixtures)
      .filter(fixture => {
        const ps = participants(fixture);

        return ps.some(
          participant => teamIdFor(participant) === teamId
        );
      })
      .sort((a, b) =>
        String(b?.starting_at || "").localeCompare(
          String(a?.starting_at || "")
        )
      )
      .slice(0, 5)
      .map(fixture => {
        const ps = participants(fixture);

        const home =
          ps.find(participant => side(participant) === "home") ||
          ps[0];

        const away =
          ps.find(participant => side(participant) === "away") ||
          ps[1];

        const homeId = teamIdFor(home);
        const awayId = teamIdFor(away);

        const homeScore = scoreFor(fixture, homeId);
        const awayScore = scoreFor(fixture, awayId);

        const isHome = homeId === teamId;

        const ownScore = isHome
          ? homeScore
          : awayScore;

        const opponentScore = isHome
          ? awayScore
          : homeScore;

        let result = "N";

        if (
          ownScore !== null &&
          opponentScore !== null
        ) {
          result =
            ownScore > opponentScore
              ? "W"
              : ownScore < opponentScore
              ? "L"
              : "D";
        }

        return {
          fixtureId: fixture?.id,
          date: fixture?.starting_at || null,
          opponent: (
            isHome
              ? away?.name
              : home?.name
          ) || "Opponent",
          homeAway: isHome ? "Home" : "Away",
          score:
            homeScore !== null &&
            awayScore !== null
              ? `${homeScore}-${awayScore}`
              : null,
          result
        };
      });
  }

  try {
    // Retrieve the selected fixture.
    const fixturePayload = await sportmonks(
      `/fixtures/${encodeURIComponent(matchId)}`,
      {
        include: "participants;scores"
      }
    );

    const fixture =
      fixturePayload &&
      !Array.isArray(fixturePayload)
        ? fixturePayload
        : null;

    if (!fixture) {
      return res.status(404).json({
        error: "Fixture was not found in Sportmonks response"
      });
    }

    const ps = participants(fixture);

    const home =
      ps.find(participant => side(participant) === "home") ||
      ps[0];

    const away =
      ps.find(participant => side(participant) === "away") ||
      ps[1];

    const homeId = teamIdFor(home);
    const awayId = teamIdFor(away);

    if (!homeId || !awayId) {
      return res.status(422).json({
        error: "Could not identify both fixture participants"
      });
    }

    // Retrieve recent matches from the last 120 days.
    const now = new Date();
    const from = new Date(now);

    from.setDate(from.getDate() - 120);

    const ymd = date =>
      date.toISOString().slice(0, 10);

    const dateRange =
      `${ymd(from)}/${ymd(now)}`;

    const [
      h2hResult,
      homeRecentResult,
      awayRecentResult
    ] = await Promise.allSettled([
      // Head-to-head meetings.
      sportmonks(
        `/fixtures/head-to-head/${encodeURIComponent(homeId)}/${encodeURIComponent(awayId)}`,
        {
          include: "participants;scores"
        }
      ),

      // Recent home-team fixtures.
      sportmonks(
        `/fixtures/between/${dateRange}/${encodeURIComponent(homeId)}`,
        {
          include: "participants;scores"
        }
      ),

      // Recent away-team fixtures.
      sportmonks(
        `/fixtures/between/${dateRange}/${encodeURIComponent(awayId)}`,
        {
          include: "participants;scores"
        }
      )
    ]);

    const h2h =
      h2hResult.status === "fulfilled"
        ? list(h2hResult.value)
        : [];

    const homeRecent =
      homeRecentResult.status === "fulfilled"
        ? list(homeRecentResult.value)
        : [];

    const awayRecent =
      awayRecentResult.status === "fulfilled"
        ? list(awayRecentResult.value)
        : [];

    const responseData = {
      fixture: {
        id: fixture.id,
        name:
          fixture.name ||
          `${home?.name || "Home"} vs ${away?.name || "Away"}`,
        startingAt: fixture.starting_at || null
      },

      teams: {
        home: {
          id: homeId,
          name: home?.name || "Home"
        },

        away: {
          id: awayId,
          name: away?.name || "Away"
        }
      },

      recentForm: {
        home: teamForm(homeRecent, homeId),
        away: teamForm(awayRecent, awayId)
      },

      headToHead: h2h
        .filter(item =>
          String(item?.id) !== matchId
        )
        .sort((a, b) =>
          String(b?.starting_at || "").localeCompare(
            String(a?.starting_at || "")
          )
        )
        .slice(0, 5)
        .map(item => {
          const itemParticipants = participants(item);

          const itemHome =
            itemParticipants.find(
              participant => side(participant) === "home"
            ) ||
            itemParticipants[0];

          const itemAway =
            itemParticipants.find(
              participant => side(participant) === "away"
            ) ||
            itemParticipants[1];

          const itemHomeId = teamIdFor(itemHome);
          const itemAwayId = teamIdFor(itemAway);

          const homeScore = scoreFor(
            item,
            itemHomeId
          );

          const awayScore = scoreFor(
            item,
            itemAwayId
          );

          return {
            fixtureId: item.id,
            date: item.starting_at || null,
            home: itemHome?.name || "Home",
            away: itemAway?.name || "Away",

            score:
              homeScore !== null &&
              awayScore !== null
                ? `${homeScore}-${awayScore}`
                : "Score unavailable"
          };
        }),

      notes: {
        recentForm:
          "Recent results are limited to the last 120 days and the latest five available fixtures per team.",

        headToHead:
          h2hResult.status === "rejected"
            ? "Head-to-head data could not be retrieved for this subscription or fixture."
            : "",

        homeForm:
          homeRecentResult.status === "rejected"
            ? "Home-team recent results are unavailable."
            : "",

        awayForm:
          awayRecentResult.status === "rejected"
            ? "Away-team recent results are unavailable."
            : ""
      }
    };

    return res.status(200).json({
      data: responseData
    });

  } catch (error) {
    console.error(
      "Sportmonks Match Insights error:",
      error
    );

    return res.status(502).json({
      error: "Could not load Match Insights",
      message:
        error.message ||
        "Sportmonks request failed"
    });
  }
}