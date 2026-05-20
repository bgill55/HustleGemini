// Hustle-relevant Google Trends category IDs
// Business & Industrial: 12, Finance: 7, Internet & Telecom: 13,
// Shopping: 18, Jobs & Education: 958, Computers & Electronics: 5
const HUSTLE_CATEGORIES = [12, 7, 13, 18, 958, 5];

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const geo = url.searchParams.get('geo') || 'US';

    // Fetch from all hustle-relevant categories in parallel
    const fetches = HUSTLE_CATEGORIES.map(cat =>
      fetch(`https://trends.google.com/trending/rss?geo=${geo}&cat=${cat}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/xml, text/xml, */*'
        }
      })
    );

    const responses = await Promise.allSettled(fetches);
    const allItems = [];
    const seenTitles = new Set();

    for (const result of responses) {
      if (result.status !== 'fulfilled' || !result.value.ok) continue;

      const xmlText = await result.value.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;

      while ((match = itemRegex.exec(xmlText)) !== null) {
        const itemContent = match[1];

        const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
        const trafficMatch = itemContent.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/);
        const descMatch = itemContent.match(/<description>([\s\S]*?)<\/description>/);
        const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);

        if (!titleMatch) continue;

        const title = decodeHtmlEntities(titleMatch[1].trim());

        // Skip duplicates
        const titleLower = title.toLowerCase();
        if (seenTitles.has(titleLower)) continue;
        seenTitles.add(titleLower);

        allItems.push({
          title,
          traffic: trafficMatch ? trafficMatch[1].trim() : 'Unknown',
          description: descMatch ? decodeHtmlEntities(descMatch[1].trim()) : '',
          link: linkMatch ? linkMatch[1].trim() : ''
        });
      }
    }

    // Sort by traffic (highest first)
    allItems.sort((a, b) => {
      const parseTraffic = t => parseInt(t.replace(/[^0-9]/g, '')) || 0;
      return parseTraffic(b.traffic) - parseTraffic(a.traffic);
    });

    // Return top 10
    const trends = allItems.slice(0, 10);

    // If we got nothing from categories, fall back to general feed
    if (trends.length === 0) {
      const fallback = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/xml, text/xml, */*'
        }
      });
      if (fallback.ok) {
        const xmlText = await fallback.text();
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xmlText)) !== null && trends.length < 8) {
          const itemContent = match[1];
          const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
          const trafficMatch = itemContent.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/);
          if (titleMatch) {
            trends.push({
              title: decodeHtmlEntities(titleMatch[1].trim()),
              traffic: trafficMatch ? trafficMatch[1].trim() : 'Unknown',
              description: '',
              link: ''
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ trends, source: 'hustle-filtered' }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<\/?[^>]+(>|$)/g, '');
}
