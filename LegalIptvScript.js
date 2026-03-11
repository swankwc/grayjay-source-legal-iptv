// =============================================================================
// Legal IPTV — Grayjay Plugin v5
// Clean rewrite following official Grayjay plugin API patterns.
// Uses ES6 (matches Grayjay's actual JS engine — same as Odysee, YouTube plugins).
// =============================================================================

const PLATFORM = "Legal IPTV";
const BASE_URL  = "https://iptv-org.github.io/iptv/";
const WATCH_PREFIX   = BASE_URL + "watch/";
const CHANNEL_PREFIX = BASE_URL + "channel/";
const PAGE_SIZE          = 40;
const CACHE_TTL_MS       = 5  * 60 * 1000;
const STALE_CACHE_TTL_MS = 60 * 60 * 1000;

const PLAYLISTS = [
  { key: "all",           name: "All Legal Channels",     url: BASE_URL + "index.m3u" },
  { key: "eng",           name: "English",                url: BASE_URL + "languages/eng.m3u" },
  { key: "spa",           name: "Spanish",                url: BASE_URL + "languages/spa.m3u" },
  { key: "fra",           name: "French",                 url: BASE_URL + "languages/fra.m3u" },
  { key: "por",           name: "Portuguese",             url: BASE_URL + "languages/por.m3u" },
  { key: "ara",           name: "Arabic",                 url: BASE_URL + "languages/ara.m3u" },
  { key: "zho",           name: "Chinese",                url: BASE_URL + "languages/zho.m3u" },
  { key: "hin",           name: "Hindi",                  url: BASE_URL + "languages/hin.m3u" },
  { key: "us",            name: "United States",          url: BASE_URL + "countries/us.m3u" },
  { key: "gb",            name: "United Kingdom",         url: BASE_URL + "countries/gb.m3u" },
  { key: "ca",            name: "Canada",                 url: BASE_URL + "countries/ca.m3u" },
  { key: "au",            name: "Australia",              url: BASE_URL + "countries/au.m3u" },
  { key: "movies",        name: "Movies",                 url: BASE_URL + "categories/movies.m3u" },
  { key: "series",        name: "Series",                 url: BASE_URL + "categories/series.m3u" },
  { key: "kids",          name: "Kids",                   url: BASE_URL + "categories/kids.m3u" },
  { key: "news",          name: "News",                   url: BASE_URL + "categories/news.m3u" },
  { key: "sports",        name: "Sports",                 url: BASE_URL + "categories/sports.m3u" },
  { key: "music",         name: "Music",                  url: BASE_URL + "categories/music.m3u" },
  { key: "documentary",   name: "Documentary",            url: BASE_URL + "categories/documentary.m3u" },
  { key: "entertainment", name: "Entertainment",          url: BASE_URL + "categories/entertainment.m3u" },
  { key: "religious",     name: "Religious",              url: BASE_URL + "categories/religious.m3u" },
  { key: "freetv",        name: "Free-TV Curated",        url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8" },
];

// Mutable state set in source.enable
let _config   = {};
let _settings = {};
const _cache  = {};   // playlistKey -> { ts, entries }
const _epg    = {};   // domain      -> { ts, data }

// =============================================================================
// Pagers (ES6 class syntax — officially supported by Grayjay)
// =============================================================================

class IptvVideoPager extends VideoPager {
  constructor(results, hasMore, ctx) {
    super(results, hasMore, ctx);
  }
  nextPage() {
    const c = this.context;
    if (c.kind === "home")
      return source.getHome(c.nextToken);
    if (c.kind === "search")
      return source.search(c.query, Type.Feed.Mixed, c.order, c.filters, c.nextToken);
    if (c.kind === "channel")
      return source.getChannelContents(c.url, Type.Feed.Mixed, c.order, c.filters, c.nextToken);
    if (c.kind === "searchChannel")
      return source.searchChannelContents(c.url, c.query, Type.Feed.Mixed, c.order, c.filters, c.nextToken);
    return new VideoPager([], false);
  }
}

class IptvChannelPager extends ChannelPager {
  constructor(results, hasMore, ctx) {
    super(results, hasMore, ctx);
  }
  nextPage() {
    return source.searchChannels(this.context.query, this.context.nextToken);
  }
}

// =============================================================================
// Lifecycle
// =============================================================================

source.enable = function(conf, settings, _savedState) {
  _config   = conf     || {};
  _settings = settings || {};
};

source.disable = function() {};

source.saveState = function() {
  return null;
};

// =============================================================================
// Home
// =============================================================================

source.getHome = function(continuationToken) {
  const page    = _page(continuationToken);
  const entries = _homeEntries();
  const start   = (page - 1) * PAGE_SIZE;
  const end     = start + PAGE_SIZE;
  const items   = entries.slice(start, end).map(_toVideo).filter(Boolean);
  return new IptvVideoPager(items, end < entries.length, {
    kind: "home", nextToken: end < entries.length ? page + 1 : null
  });
};

// =============================================================================
// Search
// =============================================================================

source.searchSuggestions = function(query) {
  if (!query || query.trim().length < 2) return [];
  const low   = query.trim().toLowerCase();
  const seen  = {};
  const out   = [];
  const all   = _entries(_activePL());

  for (let i = 0; i < all.length && out.length < 8; i++) {
    const k = all[i].name.toLowerCase();
    if (k.startsWith(low) && !seen[k]) { seen[k] = 1; out.push(all[i].name); }
  }
  const groups = _groups(_activePL());
  for (let i = 0; i < groups.length && out.length < 12; i++) {
    const k = groups[i].name.toLowerCase();
    if (k.startsWith(low) && !seen[k]) { seen[k] = 1; out.push(groups[i].name); }
  }
  return out;
};

source.getSearchCapabilities = function() {
  return {
    types: [Type.Feed.Mixed, Type.Feed.Streams],
    sorts: [Type.Order.Chronological],
    filters: [_typeFilterSpec()]
  };
};

source.search = function(query, _type, order, filters, continuationToken) {
  const page    = _page(continuationToken);
  const low     = _s(query).trim().toLowerCase();
  const tf      = _typeFilter(filters);
  const results = _entries(_activePL()).filter(e => _matchQuery(e, low) && _matchType(e, tf));
  const start   = (page - 1) * PAGE_SIZE;
  const end     = start + PAGE_SIZE;
  return new IptvVideoPager(
    results.slice(start, end).map(_toVideo).filter(Boolean),
    end < results.length,
    { kind: "search", query, order, filters, nextToken: end < results.length ? page + 1 : null }
  );
};

// =============================================================================
// Channels
// =============================================================================

source.getSearchChannelContentsCapabilities = function() {
  return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [_typeFilterSpec()] };
};

source.searchChannelContents = function(channelUrl, query, _type, order, filters, continuationToken) {
  const ref     = _parseChannelUrl(channelUrl);
  const pl      = _getPL(ref.playlistKey);
  const page    = _page(continuationToken);
  const low     = _s(query).trim().toLowerCase();
  const tf      = _typeFilter(filters);
  const entries = _entries(pl).filter(e =>
    e.groupSlug === ref.groupSlug && _matchQuery(e, low) && _matchType(e, tf)
  );
  const start = (page - 1) * PAGE_SIZE;
  const end   = start + PAGE_SIZE;
  return new IptvVideoPager(
    entries.slice(start, end).map(_toVideo).filter(Boolean),
    end < entries.length,
    { kind: "searchChannel", url: channelUrl, query, order, filters, nextToken: end < entries.length ? page + 1 : null }
  );
};

source.searchChannels = function(query, continuationToken) {
  const page   = _page(continuationToken);
  const low    = _s(query).trim().toLowerCase();
  const pl     = _activePL();
  const groups = _groups(pl).filter(g => !low || g.name.toLowerCase().includes(low));
  const start  = (page - 1) * PAGE_SIZE;
  const end    = start + PAGE_SIZE;
  return new IptvChannelPager(
    groups.slice(start, end).map(g => _toChannel(pl, g)).filter(Boolean),
    end < groups.length,
    { query, nextToken: end < groups.length ? page + 1 : null }
  );
};

source.isChannelUrl = function(url) {
  return /^https:\/\/iptv-org\.github\.io\/iptv\/channel\/[^/]+\/[^/?#]+$/.test(_s(url));
};

source.getChannel = function(url) {
  const ref    = _parseChannelUrl(url);
  const pl     = _getPL(ref.playlistKey);
  const groups = _groups(pl);
  const group  = groups.find(g => g.slug === ref.groupSlug);
  if (!group) throw new ScriptException("Unknown IPTV group: " + ref.groupSlug);
  return _toChannel(pl, group);
};

source.getChannelCapabilities = function() {
  return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [_typeFilterSpec()] };
};

source.getChannelContents = function(url, _type, order, filters, continuationToken) {
  const ref     = _parseChannelUrl(url);
  const pl      = _getPL(ref.playlistKey);
  const page    = _page(continuationToken);
  const tf      = _typeFilter(filters);
  const entries = _entries(pl).filter(e => e.groupSlug === ref.groupSlug && _matchType(e, tf));
  const start   = (page - 1) * PAGE_SIZE;
  const end     = start + PAGE_SIZE;
  return new IptvVideoPager(
    entries.slice(start, end).map(_toVideo).filter(Boolean),
    end < entries.length,
    { kind: "channel", url, order, filters, nextToken: end < entries.length ? page + 1 : null }
  );
};

// =============================================================================
// Content Details
// =============================================================================

source.isContentDetailsUrl = function(url) {
  return /^https:\/\/iptv-org\.github\.io\/iptv\/watch\/[^/]+\/[^/?#]+$/.test(_s(url));
};

source.getContentDetails = function(url) {
  const ref   = _parseWatchUrl(url);
  const pl    = _getPL(ref.playlistKey);
  const entry = _findById(_entries(pl), ref.entryId);
  if (!entry) throw new ScriptException("IPTV stream not found: " + ref.entryId);

  const vod = _isVod(entry);
  const pb  = _buildPlayback(entry);
  return new PlatformVideoDetails({
    id:          _pid("stream:" + entry.id),
    name:        entry.name,
    thumbnails:  _thumbs(entry.logo),
    author:      _author(entry),
    uploadDate:  0,
    duration:    vod ? -1 : 0,
    viewCount:   0,
    url:         _watchUrl(entry.playlistKey, entry.id),
    isLive:      !vod,
    description: _desc(entry),
    video:       pb.descriptor,
    hls:         pb.hls,
    dash:        pb.dash,
    live:        pb.live,
    subtitles:   []
  });
};

// =============================================================================
// Stubs (required by interface, not applicable to IPTV)
// =============================================================================

source.getComments              = (_url, _ct)     => new CommentPager([], false);
source.getSubComments           = (_comment)      => new CommentPager([], false);
source.getContentChapters       = (_url)          => [];
source.getPlaybackTracker       = (_url)          => null;
source.getLiveChatWindow        = (_url)          => [];
source.getContentRecommendations = (_url)         => new VideoPager([], false);
source.getLiveEvents            = (_url)          => [];
source.getShorts                = ()              => new VideoPager([], false);
source.getChannelPlaylists      = (_url)          => [];
source.getPeekChannelTypes      = ()              => [Type.Feed.Mixed];
source.peekChannelContents      = (url, type)     => source.getChannelContents(url, type || Type.Feed.Mixed, Type.Order.Chronological, {}, null);
source.getChannelUrlByClaim     = (_t, _v)        => null;
source.getChannelTemplateByClaimMap = ()          => ({});
source.searchPlaylists          = ()              => new VideoPager([], false);
source.isPlaylistUrl            = (_url)          => false;
source.getPlaylist              = (_url)          => null;
source.getUserPlaylists         = ()              => new VideoPager([], false);
source.getUserHistory           = ()              => new VideoPager([], false);
source.getUserSubscriptions     = ()              => new ChannelPager([], false);

// =============================================================================
// Playlist fetching & parsing
// =============================================================================

function _entries(pl) {
  const now    = Date.now();
  const cached = _cache[pl.key];
  if (cached && now - cached.ts < CACHE_TTL_MS) return _applyFilters(cached.entries);
  try {
    const entries = _fetchEntries(pl);
    _cache[pl.key] = { ts: now, entries };
    return _applyFilters(entries);
  } catch (err) {
    if (cached && now - cached.ts < STALE_CACHE_TTL_MS) return _applyFilters(cached.entries);
    throw err;
  }
}

function _fetchEntries(pl) {
  const urls = _candidateUrls(pl);
  let last;
  for (const url of urls) {
    try {
      const r = http.GET(url, {}, false);
      if (r && r.isOk) return _parseM3U(r.body, pl);
      last = new ScriptException("HTTP error fetching: " + url);
    } catch (e) { last = e; }
  }
  throw last || new ScriptException("Failed to load playlist: " + pl.url);
}

function _candidateUrls(pl) {
  const urls   = [];
  const mirror = _mirrorBase();
  if (mirror) urls.push(mirror + "/" + pl.key + ".m3u");
  urls.push(pl.url);
  return urls;
}

function _mirrorBase() {
  const configured = _s(_settings.playlistMirrorBase).replace(/\/+$/, "");
  if (configured) return configured;
  const src   = _s(_config.sourceUrl);
  const match = /^(https?:\/\/.+?)\/[^/]+$/.exec(src);
  return match ? match[1].replace(/\/+$/, "") + "/mirror" : "";
}

function _parseM3U(body, pl) {
  const lines   = _s(body).replace(/\r/g, "").split("\n");
  const entries = [];
  let   pending = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      pending = _parseExtInf(line);
      continue;
    }
    if (line.startsWith("#EXTGRP:") && pending) {
      pending.groupTitle = pending.groupTitle || line.slice(8).trim();
      continue;
    }
    if (line.startsWith("#")) continue;
    if (!pending) continue;
    if (!/^https?:\/\//i.test(line)) { pending = null; continue; }

    const groupName = pending.groupTitle || pl.name || "IPTV";
    const idSeed    = pl.key + "|" + line + "|" + pending.name + "|" + groupName;
    const rawName   = pending.name || "Untitled";
    const qm        = /\((\d{3,4}p)\)/.exec(rawName);

    entries.push({
      id:          _hash(idSeed),
      playlistKey:  pl.key,
      playlistName: pl.name,
      name:        rawName.replace(/\s*\(\d{3,4}p\)\s*$/, "").trim() || rawName,
      nameRaw:     rawName,
      quality:     qm ? qm[1] : "",
      streamUrl:   line,
      logo:        pending.tvgLogo    || "",
      tvgId:       pending.tvgId      || "",
      groupName,
      groupSlug:   _slug(groupName),
      country:     pending.tvgCountry  || "",
      language:    pending.tvgLanguage || "",
      userAgent:   pending.httpUserAgent || ""
    });
    pending = null;
  }

  entries.sort((a, b) => {
    const g = _cmp(a.groupName, b.groupName);
    return g !== 0 ? g : _cmp(a.name, b.name);
  });
  return entries;
}

function _parseExtInf(line) {
  const info = { name: "", groupTitle: "", tvgId: "", tvgLogo: "", tvgCountry: "", tvgLanguage: "", httpUserAgent: "" };
  const ci   = line.lastIndexOf(",");
  info.name  = ci >= 0 ? line.slice(ci + 1).trim() : "";
  const attrs  = ci >= 0 ? line.slice(0, ci) : line;
  const re     = /([A-Za-z0-9_-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrs)) !== null) {
    const [, k, v] = m;
    if (k === "group-title")    info.groupTitle    = v;
    if (k === "tvg-id")         info.tvgId         = v;
    if (k === "tvg-logo")       info.tvgLogo       = v;
    if (k === "tvg-country")    info.tvgCountry    = v;
    if (k === "tvg-language")   info.tvgLanguage   = v;
    if (k === "http-user-agent") info.httpUserAgent = v;
  }
  return info;
}

// =============================================================================
// Filters
// =============================================================================

function _applyFilters(entries) {
  if (!entries) return [];
  const typeIdx    = parseInt(_s(_settings.contentTypeFilter, "0"), 10) || 0;
  const langIdx    = parseInt(_s(_settings.languageFilter,    "0"), 10) || 0;
  const countryIdx = parseInt(_s(_settings.countryFilter,     "0"), 10) || 0;
  const hideUndef  = _s(_settings.hideUndefined, "false") === "true";
  const resIdx     = parseInt(_s(_settings.resolutionFilter,  "0"), 10) || 0;

  return entries.filter(e => {
    if (hideUndef && e.groupName === "IPTV") return false;

    if (typeIdx > 0) {
      const tm = ["","live","movies","series","kids","sports","news","music","documentary"];
      const t  = tm[typeIdx] || "";
      if (t === "live") { if (_isVod(e)) return false; }
      else { if (!e.groupName.toLowerCase().includes(t)) return false; }
    }

    if (langIdx > 0) {
      const lm = ["","eng","spa","fra","por","ara","zho","hin"];
      if (langIdx < lm.length) {
        if (!e.language.toLowerCase().includes(lm[langIdx])) return false;
      } else {
        const known = ["eng","spa","fra","por","ara","zho","hin"];
        if (known.some(l => e.language.toLowerCase().includes(l))) return false;
      }
    }

    if (countryIdx > 0) {
      const cm = ["","us","gb","ca","au"];
      if (countryIdx < cm.length) {
        if (!e.country.toLowerCase().includes(cm[countryIdx])) return false;
      } else {
        const known = ["us","gb","ca","au"];
        if (known.some(c => e.country.toLowerCase().includes(c))) return false;
      }
    }

    if (resIdx > 0) {
      const nr = e.nameRaw.toLowerCase();
      if (resIdx === 1 && !nr.includes("1080p")) return false;
      if (resIdx === 2 && !nr.includes("720p"))  return false;
      if (resIdx === 3 && !["576p","480p","270p"].some(t => nr.includes(t))) return false;
    }

    return true;
  });
}

// =============================================================================
// Groups
// =============================================================================

function _groups(pl) {
  const map = {};
  for (const e of _entries(pl)) {
    if (!map[e.groupSlug]) map[e.groupSlug] = { slug: e.groupSlug, name: e.groupName, logo: e.logo, count: 0 };
    map[e.groupSlug].count++;
    if (!map[e.groupSlug].logo && e.logo) map[e.groupSlug].logo = e.logo;
  }
  return Object.values(map).sort((a, b) => _cmp(a.name, b.name));
}

// =============================================================================
// Builders
// =============================================================================

function _toVideo(entry) {
  const vod = _isVod(entry);
  return new PlatformVideo({
    id:         _pid("stream:" + entry.id),
    name:       entry.name,
    thumbnails: _thumbs(entry.logo),
    author:     _author(entry),
    uploadDate: 0,
    duration:   vod ? -1 : 0,
    viewCount:  0,
    url:        _watchUrl(entry.playlistKey, entry.id),
    isLive:     !vod
  });
}

function _toChannel(pl, group) {
  return new PlatformChannel({
    id:          _pid("group:" + pl.key + ":" + group.slug),
    name:        group.name,
    thumbnail:   group.logo || "",
    banner:      group.logo || "",
    subscribers: group.count,
    description: group.count + " channels from the " + pl.name + " legal IPTV playlist.",
    url:         _channelUrl(pl.key, group.slug),
    links:       []
  });
}

function _author(entry) {
  return new PlatformAuthorLink(
    _pid("group:" + entry.playlistKey + ":" + entry.groupSlug),
    entry.groupName,
    _channelUrl(entry.playlistKey, entry.groupSlug),
    entry.logo || "",
    0
  );
}

function _thumbs(url) {
  return new Thumbnails(url ? [new Thumbnail(url, 512)] : []);
}

function _buildPlayback(entry) {
  const url = _s(entry.streamUrl);
  if (/\.m3u8(?:$|\?)/i.test(url)) {
    const hls = new HLSSource({ name: "HLS", duration: 0, url });
    return { descriptor: new VideoSourceDescriptor([hls]), hls, dash: null, live: hls };
  }
  if (/\.mpd(?:$|\?)/i.test(url)) {
    const dash = new DashSource({ name: "DASH", duration: 0, url });
    return { descriptor: new VideoSourceDescriptor([dash]), hls: null, dash, live: dash };
  }
  const src = new VideoUrlSource({ width: 0, height: 0, container: _container(url), codec: "unknown", name: "Stream", bitrate: 0, duration: 0, url });
  return { descriptor: new VideoSourceDescriptor([src]), hls: null, dash: null, live: null };
}

function _desc(entry) {
  const lines = [];
  try {
    const epg = _epgNow(entry);
    if (epg && epg.current) {
      lines.push("NOW: " + epg.current.title);
      if (epg.next) lines.push("NEXT: " + epg.next.title);
      lines.push("");
    }
  } catch (_) { /* EPG is best-effort */ }
  lines.push("Playlist: " + entry.playlistName);
  lines.push("Group: "    + entry.groupName);
  if (entry.language) lines.push("Language: " + entry.language);
  if (entry.country)  lines.push("Country: "  + entry.country);
  if (entry.tvgId)    lines.push("TVG ID: "   + entry.tvgId);
  lines.push("Stream: " + entry.streamUrl);
  return lines.join("\n");
}

// =============================================================================
// EPG (best-effort, silent on failure)
// =============================================================================

function _epgNow(entry) {
  if (!entry.tvgId || !entry.tvgId.includes("@")) return null;
  const domain  = entry.tvgId.split("@")[0];
  const now     = Date.now();
  const cached  = _epg[domain];
  if (!cached || now - cached.ts > CACHE_TTL_MS) {
    try {
      const r = http.GET("https://iptv-org.github.io/epg/guides/" + domain + ".xml", {}, false);
      if (!r || !r.isOk) return null;
      _epg[domain] = { ts: now, data: _parseXmltv(r.body) };
    } catch (_) { return null; }
  }
  const data = (_epg[domain] || {}).data;
  if (!data) return null;
  const programs = data.filter(p => p.channelId === entry.tvgId);
  const d = new Date();
  for (let i = 0; i < programs.length; i++) {
    const p = programs[i];
    if (d >= p.start && d < p.stop)
      return { current: p, next: programs[i + 1] || null };
  }
  return null;
}

function _parseXmltv(body) {
  const out  = [];
  const re   = /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/g;
  const reT  = /<title[^>]*>([\s\S]*?)<\/title>/;
  const reD  = /<desc[^>]*>([\s\S]*?)<\/desc>/;
  let m;
  while ((m = re.exec(body)) !== null) {
    const sm = /start="([^"]+)"/.exec(m[1]);
    const em = /stop="([^"]+)"/.exec(m[1]);
    const cm = /channel="([^"]+)"/.exec(m[1]);
    if (!sm || !em || !cm) continue;
    const tm = reT.exec(m[2]);
    const dm = reD.exec(m[2]);
    out.push({
      channelId: cm[1],
      start: _xmltvDate(sm[1]),
      stop:  _xmltvDate(em[1]),
      title: tm ? _xmlEnt(tm[1]) : "Untitled",
      desc:  dm ? _xmlEnt(dm[1]) : ""
    });
  }
  return out;
}

function _xmltvDate(s) {
  return new Date(Date.UTC(
    parseInt(s.slice(0,4)), parseInt(s.slice(4,6))-1, parseInt(s.slice(6,8)),
    parseInt(s.slice(8,10)), parseInt(s.slice(10,12)), parseInt(s.slice(12,14))
  ));
}

function _xmlEnt(s) {
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
          .replace(/&quot;/g,'"').replace(/&apos;/g,"'");
}

// =============================================================================
// URL helpers
// =============================================================================

function _watchUrl(pk, id)   { return WATCH_PREFIX   + encodeURIComponent(pk) + "/" + encodeURIComponent(id); }
function _channelUrl(pk, gs) { return CHANNEL_PREFIX + encodeURIComponent(pk) + "/" + encodeURIComponent(gs); }

function _parseWatchUrl(url) {
  const m = /^https:\/\/iptv-org\.github\.io\/iptv\/watch\/([^/]+)\/([^/?#]+)$/.exec(_s(url));
  if (!m) throw new ScriptException("Invalid IPTV watch URL: " + url);
  return { playlistKey: decodeURIComponent(m[1]), entryId: decodeURIComponent(m[2]) };
}

function _parseChannelUrl(url) {
  const m = /^https:\/\/iptv-org\.github\.io\/iptv\/channel\/([^/]+)\/([^/?#]+)$/.exec(_s(url));
  if (!m) throw new ScriptException("Invalid IPTV channel URL: " + url);
  return { playlistKey: decodeURIComponent(m[1]), groupSlug: decodeURIComponent(m[2]) };
}

// =============================================================================
// Helpers
// =============================================================================

function _activePL() {
  const idx = parseInt(_s(_settings.homeFeedIndex, "0"), 10) || 0;
  return PLAYLISTS[idx >= 0 && idx < PLAYLISTS.length ? idx : 0];
}

function _getPL(key) {
  const pl = PLAYLISTS.find(p => p.key === key);
  if (!pl) throw new ScriptException("Unknown playlist key: " + key);
  return pl;
}

function _homeEntries() {
  const limit = [50, 100, 200, 400][parseInt(_s(_settings.maxHomeCountIndex, "1"), 10)] || 100;
  return _entries(_activePL()).slice(0, limit);
}

function _page(token) {
  if (!token) return 1;
  const p = parseInt(String(token), 10);
  return (isNaN(p) || p < 1) ? 1 : p;
}

function _pid(id)    { return new PlatformID(PLATFORM, id, _config.id); }
function _s(v, fb)   { return (v == null) ? (fb == null ? "" : String(fb)) : String(v); }
function _cmp(a, b)  { const x = _s(a).toLowerCase(), y = _s(b).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
function _isVod(e)   { const g = e.groupName.toLowerCase(); return g.includes("movies") || g.includes("series"); }
function _matchQuery(e, low) {
  if (!low) return true;
  return [e.name, e.groupName, e.country, e.language, e.tvgId].join(" ").toLowerCase().includes(low);
}
function _matchType(e, tf) {
  if (!tf) return true;
  if (tf === "live")  return !_isVod(e);
  return e.groupName.toLowerCase().includes(tf);
}
function _typeFilter(filters) {
  return (filters && filters.type) ? _s(filters.type).toLowerCase() : "";
}
function _typeFilterSpec() {
  return {
    id: "type", name: "Type", isMultiSelect: false,
    filters: [
      { id: "live",        name: "Live TV",     value: "live" },
      { id: "movies",      name: "Movies",      value: "movies" },
      { id: "series",      name: "Series",      value: "series" },
      { id: "kids",        name: "Kids",        value: "kids" },
      { id: "news",        name: "News",        value: "news" },
      { id: "sports",      name: "Sports",      value: "sports" },
      { id: "music",       name: "Music",       value: "music" },
      { id: "documentary", name: "Documentary", value: "documentary" }
    ]
  };
}
function _slug(v)    { return _s(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "general"; }
function _container(url) {
  if (/\.mp4(?:$|\?)/i.test(url))  return "video/mp4";
  if (/\.ts(?:$|\?)/i.test(url))   return "video/mp2t";
  if (/\.mp3(?:$|\?)/i.test(url))  return "audio/mpeg";
  if (/\.aac(?:$|\?)/i.test(url))  return "audio/aac";
  return "application/octet-stream";
}
function _findById(entries, id) {
  if (id === "__sample__") return entries[0] || null;
  return entries.find(e => e.id === id) || null;
}
function _hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (((h << 5) + h) + text.charCodeAt(i)) & 0xffffffff;
  return (h >>> 0).toString(16);
}
