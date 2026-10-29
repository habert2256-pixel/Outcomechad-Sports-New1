// api/ads.js
// OutcomeChad Sports — Temporary Sponsor Ads
// This is a demo configuration. Ads are stored in code, not a database.

const ads = [
  {
    id: "sponsor-001",
    title: "Your Brand Here",
    description: "Reach football and basketball fans on OutcomeChad Sports.",
    image: "/ads/sponsor-placeholder.png",
    url: "https://example.com",
    placement: "top",
    active: true
  },
  {
    id: "sponsor-002",
    title: "Advertise With OutcomeChad",
    description: "Promote your brand to sports fans.",
    image: "/ads/sponsor-placeholder.png",
    url: "https://example.com",
    placement: "in-feed",
    active: true
  },
  {
    id: "sponsor-003",
    title: "Become an OutcomeChad Sponsor",
    description: "Contact us to discuss advertising opportunities.",
    image: "/ads/sponsor-placeholder.png",
    url: "https://example.com",
    placement: "bottom",
    active: true
  }
];

export default function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const placement = req.query.placement;

  const activeAds = ads.filter(ad => {
    return ad.active && (!placement || ad.placement === placement);
  });

  return res.status(200).json({
    success: true,
    count: activeAds.length,
    ads: activeAds
  });
}