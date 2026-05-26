export async function onRequestGet(context) {
  try {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    };

    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // Fetch Product Hunt Daily
    const phPromise = fetch('https://www.producthunt.com/feed', {
      headers: { 'User-Agent': userAgent, 'Accept': 'application/xml, text/xml, */*' }
    }).then(async r => r.ok ? r.text() : '').catch(() => '');

    // Fetch Reddit r/sidehustle
    const redditPromise = fetch('https://www.reddit.com/r/sidehustle/hot.rss', {
      headers: { 'User-Agent': userAgent, 'Accept': 'application/xml, text/xml, */*' }
    }).then(async r => r.ok ? r.text() : '').catch(() => '');

    // Fetch Reddit r/saas
    const saasPromise = fetch('https://www.reddit.com/r/saas/hot.rss', {
      headers: { 'User-Agent': userAgent, 'Accept': 'application/xml, text/xml, */*' }
    }).then(async r => r.ok ? r.text() : '').catch(() => '');

    const [phXml, redditXml, saasXml] = await Promise.all([phPromise, redditPromise, saasPromise]);

    const feeds = [];

    // Parse Product Hunt Atom (uses <entry>)
    if (phXml) {
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;
      let count = 0;
      while ((match = entryRegex.exec(phXml)) !== null && count < 6) {
        const entry = match[1];
        const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = entry.match(/<link[^>]+href="([^"]+)"/);
        const contentMatch = entry.match(/<content.*?>([\s\S]*?)<\/content>/);

        if (titleMatch) {
          let desc = 'Trending product launch.';
          if (contentMatch) {
            const rawContent = contentMatch[1].trim();
            const pMatch = rawContent.match(/<p>([\s\S]*?)<\/p>/) || rawContent.match(/&lt;p&gt;([\s\S]*?)&lt;\/p&gt;/);
            if (pMatch) {
              desc = decodeHtmlEntities(pMatch[1].trim());
            } else {
              desc = decodeHtmlEntities(rawContent).substring(0, 150) + '...';
            }
          }
          feeds.push({
            source: 'Product Hunt',
            title: decodeHtmlEntities(titleMatch[1].trim()),
            description: desc,
            link: linkMatch ? linkMatch[1].trim() : 'https://www.producthunt.com'
          });
          count++;
        }
      }
    }

    // Parse Reddit r/sidehustle Atom (uses <entry>)
    if (redditXml) {
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;
      let count = 0;
      while ((match = entryRegex.exec(redditXml)) !== null && count < 5) {
        const entry = match[1];
        const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = entry.match(/<link href="([^"]+)"/);

        if (titleMatch) {
          const title = decodeHtmlEntities(titleMatch[1].trim());
          // Skip pinned threads
          if (title.toLowerCase().includes('moderator') || title.toLowerCase().includes('promotion') || title.toLowerCase().includes('monthly thread')) {
            continue;
          }
          feeds.push({
            source: 'Reddit r/sidehustle',
            title: title,
            description: 'Hot discussion in r/sidehustle community.',
            link: linkMatch ? linkMatch[1].trim() : 'https://www.reddit.com/r/sidehustle'
          });
          count++;
        }
      }
    }

    // Parse Reddit r/saas Atom (uses <entry>)
    if (saasXml) {
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;
      let count = 0;
      while ((match = entryRegex.exec(saasXml)) !== null && count < 5) {
        const entry = match[1];
        const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = entry.match(/<link href="([^"]+)"/);

        if (titleMatch) {
          const title = decodeHtmlEntities(titleMatch[1].trim());
          if (title.toLowerCase().includes('moderator') || title.toLowerCase().includes('monthly thread')) {
            continue;
          }
          feeds.push({
            source: 'Reddit r/saas',
            title: title,
            description: 'SaaS founder discussion in r/saas.',
            link: linkMatch ? linkMatch[1].trim() : 'https://www.reddit.com/r/saas'
          });
          count++;
        }
      }
    }

    return new Response(JSON.stringify({ feeds }), { headers: corsHeaders });

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
    .replace(/<\/?[^>]+(>|$)/g, ''); // strip inline tags
}
