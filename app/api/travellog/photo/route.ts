// app/api/travellog/photo/route.ts
import { NextResponse } from 'next/server';

const UNSPLASH_API_URL = 'https://api.unsplash.com/search/photos';

interface UnsplashPhoto {
  urls: { regular: string; thumb: string };
  alt_description: string | null;
  links: { download_location: string };
  user: { name: string; links: { html: string } };
}

export interface DestinationPhoto {
  url: string;
  thumbUrl: string;
  alt: string;
  photographerName: string;
  photographerUrl: string;
}

const UTM = 'utm_source=burnlog&utm_medium=referral';

// One search result per destination, cached at the edge for a week —
// destination photos don't need to be fresh, and Unsplash's free/demo tier
// is capped at 50 requests/hour, so re-fetching per page view would blow
// through that almost immediately.
export async function GET(request: Request) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return NextResponse.json({ error: 'Unsplash not configured' }, { status: 501 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();
  if (!query) {
    return NextResponse.json({ error: 'Missing q param' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${UNSPLASH_API_URL}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${accessKey}` } }
    );
    if (!res.ok) {
      return NextResponse.json({ error: `Unsplash request failed: ${res.status}` }, { status: 502 });
    }
    const data = (await res.json()) as { results?: UnsplashPhoto[] };
    const photo = data.results?.[0];
    if (!photo) {
      return NextResponse.json({ photo: null });
    }

    // Required by the Unsplash API guidelines whenever a photo is actually
    // served to a user (not just previewed while developing) — fire-and-
    // forget, must not block or fail the response.
    fetch(`${photo.links.download_location}?client_id=${accessKey}`).catch(() => {});

    const result: DestinationPhoto = {
      url: photo.urls.regular,
      thumbUrl: photo.urls.thumb,
      alt: photo.alt_description || query,
      photographerName: photo.user.name,
      photographerUrl: `${photo.user.links.html}?${UTM}`,
    };

    return NextResponse.json(
      { photo: result },
      { headers: { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    console.error('travellog photo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
