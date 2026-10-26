export const dynamic = "force-dynamic";

type NominatimRow = { display_name?: string; lat?: string; lon?: string };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 120) {
    return Response.json({ results: [] });
  }
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "rw");
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "TreeLifeRwanda/0.1 (local tree registration)",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return Response.json({
        results: [],
        error: "The place search did not answer. Click the map to set the point.",
      });
    }
    const rows = (await response.json()) as NominatimRow[];
    const results = rows.flatMap((row) => {
      if (!row.display_name || !row.lat || !row.lon) return [];
      return [{ label: row.display_name, latitude: row.lat, longitude: row.lon }];
    });
    return Response.json({ results });
  } catch {
    return Response.json({
      results: [],
      error: "The place search did not answer. Click the map to set the point.",
    });
  }
}
