import {
  fetchISports,
  requireMatchId,
  setMatchCentreHeaders
} from "../_lib/isports.js";

export default async function handler(req, res) {
  setMatchCentreHeaders(res);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const matchId = requireMatchId(req);

  if (!matchId) {
    return res.status(400).json({
      success: false,
      message: "A matchId is required."
    });
  }

  try {
    const data = await fetchISports(
      "/sport/football/lineups",
      {
        matchId,
        isPreview: "true"
      }
    );

    return res.status(200).json(data);
  } catch (error) {
    console.error("Football lineups error:", error.message);

    return res.status(502).json({
      success: false,
      message: error.message
    });
  }
}