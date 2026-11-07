// Reads a company's website (home page plus a couple of About/Projects pages) as plain text,
// so Real Estate emails can mention what the company actually does.

const MAX_CHARS_PER_PAGE = 6000
const MAX_EXTRA_PAGES = 2
const MAX_DOWNLOAD_BYTES = 3 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15000
const CACHE_TTL_MS = 10 * 60 * 1000

// Several rows often share one company website (one row per director email): download it once.
const cache = new Map()

// "www.acme.com", "acme.com/about" or "https://acme.com" -> a full URL, or null if it isn't one.
const normaliseUrl = (value) => {
  const text = String(value ?? '').trim().replace(/[.,;]+$/, '')
  if (!text) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return url.hostname.includes('.') ? url.href : null
  } catch {
    return null
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
const decodeEntities = (text) =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z0-9#]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)

const metaContent = (html, name) => {
  const match =
    html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i'))
  return match ? decodeEntities(match[1]).trim() : ''
}

const htmlToText = (html) => {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim()
  const description = metaContent(html, 'description') || metaContent(html, 'og:description')
  const body = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')

  return [title && `Title: ${title}`, description && `Description: ${description}`, body]
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_CHARS_PER_PAGE)
}

// Same-site links that usually describe the business: about, projects, portfolio...
const INTERESTING_PATH = /about|overview|who-we-are|company|profile|project|portfolio|development|business|vertical/i
const findExtraPages = (html, baseUrl) => {
  const base = new URL(baseUrl)
  const pages = []
  for (const [, href] of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(decodeEntities(href), base)
      url.hash = ''
      if (url.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue
      if (!INTERESTING_PATH.test(url.pathname) || /\.(pdf|jpe?g|png|zip|docx?)$/i.test(url.pathname)) continue
      if (url.href !== base.href && !pages.includes(url.href)) pages.push(url.href)
    } catch {
      // Ignore malformed links.
    }
  }
  return pages.slice(0, MAX_EXTRA_PAGES)
}

const downloadHtml = async (url) => {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AutoMail/1.0)',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
    },
  })
  if (!response.ok) throw new Error(`the site answered ${response.status}`)

  const type = response.headers.get('content-type') || ''
  if (type && !/text\/|html|xml/i.test(type)) throw new Error(`it is not a web page (${type.split(';')[0]})`)

  // Read at most a few MB, so a huge file can't stall the server.
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (size < MAX_DOWNLOAD_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  reader.cancel().catch(() => {})
  return { html: Buffer.concat(chunks).toString('utf8'), finalUrl: response.url || url }
}

const describeError = (error) =>
  error.name === 'TimeoutError'
    ? 'the site took too long to respond'
    : error.message === 'fetch failed'
      ? 'the site could not be reached'
      : error.message || 'it could not be loaded'

const readSite = async (url) => {
  const { html, finalUrl } = await downloadHtml(url)
  const pages = [{ url: finalUrl, text: htmlToText(html) }]
  const extras = await Promise.all(
    findExtraPages(html, finalUrl).map((pageUrl) =>
      downloadHtml(pageUrl)
        .then((page) => ({ url: pageUrl, text: htmlToText(page.html) }))
        .catch(() => null)
    )
  )
  extras.forEach((page) => page && page.text && pages.push(page))
  if (!pages.some((page) => page.text.length > 200)) {
    throw new Error('the page had almost no readable text (it may need JavaScript to load)')
  }
  return pages
}

// { ok: true, url, pages: [{ url, text }] } or { ok: false, url, error }.
const fetchWebsite = (value) => {
  const url = normaliseUrl(value)
  if (!url) return Promise.resolve({ ok: false, url: String(value ?? ''), error: 'it is not a valid web address' })

  const cached = cache.get(url)
  if (cached && cached.expires > Date.now()) return cached.promise
  const promise = readSite(url)
    .then((pages) => ({ ok: true, url, pages }))
    .catch((error) => ({ ok: false, url, error: describeError(error) }))
  cache.set(url, { promise, expires: Date.now() + CACHE_TTL_MS })
  return promise
}

module.exports = { fetchWebsite }
