
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED" });
  }

  const input = String(req.query.url || "").trim();
  let parsed;

  try {
    parsed = new URL(input);
  } catch {
    return res.status(400).json({ success: false, error: "INVALID_URL" });
  }

  const host = parsed.hostname.toLowerCase();

  if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"].includes(host)) {
    return res.status(400).json({ success: false, error: "ONLY_X_URLS_ALLOWED" });
  }

  const match = parsed.pathname.match(/\/status\/(\d+)/);

  if (!match) {
    return res.status(400).json({ success: false, error: "STATUS_ID_NOT_FOUND" });
  }

  try {
    const upstream = await fetch(
      `https://api.fxtwitter.com/status/${match[1]}`,
      { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(12000) }
    );

    if (!upstream.ok) {
      return res.status(502).json({ success: false, error: "UPSTREAM_FAILED" });
    }

    const payload = await upstream.json();
    const tweet = payload.tweet || payload;
    const videos = tweet.media?.videos || [];
    const formats = [];

    for (const video of videos) {
      for (const variant of video.variants || []) {
        if (variant.content_type === "video/mp4" && variant.url) {
          formats.push({
            type: "video",
            label: variant.bitrate ? `${Math.round(variant.bitrate / 1000)} kbps MP4` : "MP4",
            url: variant.url
          });
        }
      }
    }

    if (!formats.length) {
      return res.status(404).json({ success: false, error: "NO_PUBLIC_VIDEO_FOUND" });
    }

    formats.sort((a, b) => Number(b.label.match(/\d+/)?.[0] || 0) - Number(a.label.match(/\d+/)?.[0] || 0));

    return res.status(200).json({
      success: true,
      platform: "X",
      title: String(tweet.text || "X video").slice(0, 180),
      formats: [...new Map(formats.map(x => [x.url, x])).values()].slice(0, 8)
    });

  } catch {
    return res.status(502).json({ success: false, error: "UPSTREAM_UNAVAILABLE" });
  }
}
