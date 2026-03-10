const PLATFORM = "Legal IPTV";
const BASE_URL = "https://iptv-org.github.io/iptv/";
const WATCH_PREFIX = BASE_URL + "watch/";
const CHANNEL_PREFIX = BASE_URL + "channel/";
const PAGE_SIZE = 40;
const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_CACHE_TTL_MS = 60 * 60 * 1000;

const PLAYLISTS = [
  { key: "all", name: "All legal channels", url: BASE_URL + "index.m3u" },
  { key: "eng", name: "English channels", url: BASE_URL + "languages/eng.m3u" },
  { key: "us", name: "United States channels", url: BASE_URL + "countries/us.m3u" },
  { key: "movies", name: "Movies channels", url: BASE_URL + "categories/movies.m3u" },
  { key: "series", name: "Series channels", url: BASE_URL + "categories/series.m3u" },
  { key: "kids", name: "Kids channels", url: BASE_URL + "categories/kids.m3u" },
  { key: "news", name: "News channels", url: BASE_URL + "categories/news.m3u" }
];

let config = {};
let pluginSettings = {};
let playlistCache = {};

source.enable = function(conf, settings, savedState) {
  config = conf ?? {};
  pluginSettings = settings ?? {};
};

source.disable = function() {};

source.saveState = function() {
  return JSON.stringify({
    homeFeedIndex: safeString(pluginSettings.homeFeedIndex, "0"),
    maxHomeCountIndex: safeString(pluginSettings.maxHomeCountIndex, "1")
  });
};

source.getHome = function(continuationToken) {
  const playlist = getActivePlaylist();
  const page = getPageFromToken(continuationToken);
  const entries = getHomeEntries(playlist);
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const items = entries.slice(start, end).map(entryToPlatformVideo).filter(Boolean);
  return new LegalIptvVideoPager(items, end < entries.length, {
    kind: "home",
    playlistKey: playlist.key,
    page: page + 1
  });
};

source.searchSuggestions = function(query) {
  return [];
};

source.getSearchCapabilities = function() {
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: []
  };
};

source.search = function(query, type, order, filters, continuationToken) {
  const playlist = getActivePlaylist();
  const page = getPageFromToken(continuationToken);
  const lowered = safeString(query).trim().toLowerCase();
  const results = getEntries(playlist).filter(function(entry) {
    return lowered.length === 0 || matchesQuery(entry, lowered);
  });
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return new LegalIptvVideoPager(results.slice(start, end).map(entryToPlatformVideo).filter(Boolean), end < results.length, {
    kind: "search",
    playlistKey: playlist.key,
    query: query,
    page: page + 1
  });
};

source.getSearchChannelContentsCapabilities = function() {
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: []
  };
};

source.getShorts = function() {
  return new VideoPager([], false);
};

source.searchChannelContents = function(channelUrl, query, type, order, filters, continuationToken) {
  const channelRef = parseChannelUrl(channelUrl);
  const playlist = getPlaylistByKey(channelRef.playlistKey);
  const page = getPageFromToken(continuationToken);
  const lowered = safeString(query).trim().toLowerCase();
  const entries = getEntries(playlist).filter(function(entry) {
    return entry.groupSlug === channelRef.groupSlug && (lowered.length === 0 || matchesQuery(entry, lowered));
  });
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return new LegalIptvVideoPager(entries.slice(start, end).map(entryToPlatformVideo).filter(Boolean), end < entries.length, {
    kind: "searchChannelContents",
    url: channelUrl,
    query: query,
    page: page + 1
  });
};

source.searchChannels = function(query, continuationToken) {
  const playlist = getActivePlaylist();
  const page = getPageFromToken(continuationToken);
  const lowered = safeString(query).trim().toLowerCase();
  const channels = getGroups(playlist).filter(function(group) {
    return lowered.length === 0 || group.name.toLowerCase().indexOf(lowered) !== -1;
  });
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return new LegalIptvChannelPager(channels.slice(start, end).map(function(group) {
    return groupToPlatformChannel(playlist, group);
  }).filter(Boolean), end < channels.length, {
    kind: "searchChannels",
    playlistKey: playlist.key,
    query: query,
    page: page + 1
  });
};

source.isChannelUrl = function(url) {
  return /^https:\/\/iptv-org\.github\.io\/iptv\/channel\/[^/]+\/[^/?#]+$/.test(safeString(url));
};

source.getChannel = function(url) {
  const channelRef = parseChannelUrl(url);
  const playlist = getPlaylistByKey(channelRef.playlistKey);
  const groups = getGroups(playlist);
  const group = findGroupBySlug(groups, channelRef.groupSlug);
  if (!group) {
    throw new ScriptException("Unknown IPTV group: " + channelRef.groupSlug);
  }
  return groupToPlatformChannel(playlist, group);
};

source.getChannelCapabilities = function() {
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: []
  };
};

source.getChannelContents = function(url, type, order, filters, continuationToken) {
  const channelRef = parseChannelUrl(url);
  const playlist = getPlaylistByKey(channelRef.playlistKey);
  const page = getPageFromToken(continuationToken);
  const entries = getEntries(playlist).filter(function(entry) {
    return entry.groupSlug === channelRef.groupSlug;
  });
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return new LegalIptvVideoPager(entries.slice(start, end).map(entryToPlatformVideo).filter(Boolean), end < entries.length, {
    kind: "channelContents",
    url: url,
    page: page + 1
  });
};

source.getChannelPlaylists = function(url) {
  return [];
};

source.getPeekChannelTypes = function() {
  return [Type.Feed.Mixed];
};

source.peekChannelContents = function(url, type) {
  return source.getChannelContents(url, type || Type.Feed.Mixed, Type.Order.Chronological, {}, null);
};

source.getChannelUrlByClaim = function(claimType, claimValues) {
  return null;
};

source.getChannelTemplateByClaimMap = function() {
  return {};
};

source.isContentDetailsUrl = function(url) {
  return /^https:\/\/iptv-org\.github\.io\/iptv\/watch\/[^/]+\/[^/?#]+$/.test(safeString(url));
};

source.getContentDetails = function(url) {
  const ref = parseDetailsUrl(url);
  const playlist = getPlaylistByKey(ref.playlistKey);
  const entry = findEntryById(getEntries(playlist), ref.entryId);
  if (!entry) {
    throw new ScriptException("Unable to resolve IPTV stream details for " + ref.entryId);
  }

  const playback = buildPlayback(entry);
  return new PlatformVideoDetails({
    id: makePlatformId("stream:" + entry.id),
    name: entry.name,
    thumbnails: buildThumbnails(entry.logo),
    author: buildAuthor(entry),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    url: normalizeDetailsUrl(entry.playlistKey, entry.id),
    isLive: true,
    description: buildDescription(entry),
    video: playback.descriptor,
    hls: playback.hls,
    dash: playback.dash,
    live: playback.live,
    subtitles: []
  });
};

source.getComments = function(url, continuationToken) {
  return new CommentPager([], false);
};

source.getSubComments = function(comment) {
  return new CommentPager([], false);
};

source.getContentChapters = function(url) {
  return [];
};

source.getPlaybackTracker = function(url) {
  return null;
};

source.getLiveChatWindow = function(url) {
  return [];
};

source.getContentRecommendations = function(url) {
  return new VideoPager([], false);
};

source.getLiveEvents = function(url) {
  return [];
};

source.searchPlaylists = function(query, type, order, filters, channelId, continuationToken) {
  return new VideoPager([], false);
};

source.isPlaylistUrl = function(url) {
  return false;
};

source.getPlaylist = function(url) {
  return null;
};

source.getUserPlaylists = function() {
  return new VideoPager([], false);
};

source.getUserHistory = function() {
  return new VideoPager([], false);
};

source.getUserSubscriptions = function() {
  return new ChannelPager([], false);
};

class LegalIptvVideoPager extends VideoPager {
  constructor(results, hasMore, context) {
    super(results, hasMore, context);
  }

  nextPage() {
    if (this.context.kind === "home") {
      return source.getHome(this.context.page);
    }
    if (this.context.kind === "search") {
      return source.search(this.context.query, Type.Feed.Mixed, this.context.order, {}, this.context.page);
    }
    if (this.context.kind === "channelContents") {
      return source.getChannelContents(this.context.url, Type.Feed.Mixed, this.context.order, {}, this.context.page);
    }
    if (this.context.kind === "searchChannelContents") {
      return source.searchChannelContents(this.context.url, this.context.query, Type.Feed.Mixed, this.context.order, {}, this.context.page);
    }
    return new VideoPager([], false);
  }
}

class LegalIptvChannelPager extends ChannelPager {
  constructor(results, hasMore, context) {
    super(results, hasMore, context);
  }

  nextPage() {
    return source.searchChannels(this.context.query, this.context.page);
  }
}

function getActivePlaylist() {
  const option = safeString(pluginSettings.homeFeedIndex, "0");
  const index = parseInt(option, 10);
  if (Number.isNaN(index) || index < 0 || index >= PLAYLISTS.length) {
    return PLAYLISTS[0];
  }
  return PLAYLISTS[index];
}

function getPlaylistByKey(key) {
  for (let i = 0; i < PLAYLISTS.length; i += 1) {
    if (PLAYLISTS[i].key === key) {
      return PLAYLISTS[i];
    }
  }
  throw new ScriptException("Unknown IPTV playlist key: " + key);
}

function getHomeEntries(playlist) {
  const limit = getMaxHomeCount();
  return getEntries(playlist).slice(0, limit);
}

function getMaxHomeCount() {
  const option = safeString(pluginSettings.maxHomeCountIndex, "1");
  if (option === "0") return 50;
  if (option === "2") return 200;
  if (option === "3") return 400;
  return 100;
}

function getEntries(playlist) {
  const cacheKey = playlist.key;
  const cached = playlistCache[cacheKey];
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.entries;
  }
  try {
    const entries = fetchPlaylistEntries(playlist);
    playlistCache[cacheKey] = {
      timestamp: now,
      entries: entries
    };
    return entries;
  } catch (error) {
    if (cached && now - cached.timestamp < STALE_CACHE_TTL_MS) {
      return cached.entries;
    }
    throw error;
  }
}

function getGroups(playlist) {
  const entries = getEntries(playlist);
  const map = {};
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!map[entry.groupSlug]) {
      map[entry.groupSlug] = {
        slug: entry.groupSlug,
        name: entry.groupName,
        logo: entry.logo,
        count: 0
      };
    }
    map[entry.groupSlug].count += 1;
    if (!map[entry.groupSlug].logo && entry.logo) {
      map[entry.groupSlug].logo = entry.logo;
    }
  }
  const groups = [];
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i += 1) {
    groups.push(map[keys[i]]);
  }
  groups.sort(function(a, b) {
    return compareStrings(a.name, b.name);
  });
  return groups;
}

function parsePlaylist(body, playlist) {
  const entries = [];
  const lines = safeString(body).replace(/\r/g, "").split("\n");
  let pending = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }
    if (line.indexOf("#EXTINF:") === 0) {
      pending = parseExtInfLine(line);
      continue;
    }
    if (line.indexOf("#EXTGRP:") === 0 && pending) {
      pending.groupTitle = firstNonEmpty(pending.groupTitle, line.substring(8).trim());
      continue;
    }
    if (line.charAt(0) === "#") {
      continue;
    }
    if (!pending) {
      continue;
    }
    if (!/^https?:\/\//i.test(line)) {
      pending = null;
      continue;
    }

    const groupName = firstNonEmpty(pending.groupTitle, playlist.name, "IPTV");
    const idSeed = playlist.key + "|" + line + "|" + pending.name + "|" + groupName;
    const entryId = hashText(idSeed);
    entries.push({
      id: entryId,
      playlistKey: playlist.key,
      playlistName: playlist.name,
      name: firstNonEmpty(pending.name, "Untitled channel"),
      streamUrl: line,
      logo: firstNonEmpty(pending.tvgLogo, ""),
      tvgId: firstNonEmpty(pending.tvgId, ""),
      groupName: groupName,
      groupSlug: slugify(groupName),
      country: firstNonEmpty(pending.tvgCountry, ""),
      language: firstNonEmpty(pending.tvgLanguage, ""),
      userAgent: firstNonEmpty(pending.httpUserAgent, "")
    });
    pending = null;
  }

  entries.sort(function(a, b) {
    const byGroup = compareStrings(a.groupName, b.groupName);
    if (byGroup !== 0) {
      return byGroup;
    }
    return compareStrings(a.name, b.name);
  });
  return entries;
}

function fetchPlaylistEntries(playlist) {
  const urls = getPlaylistCandidateUrls(playlist);
  let lastError = null;
  for (let i = 0; i < urls.length; i += 1) {
    try {
      const response = http.GET(urls[i], {}, false);
      if (!response || !response.isOk) {
        throw new ScriptException("Unable to load IPTV playlist: " + urls[i]);
      }
      return parsePlaylist(response.body, playlist);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new ScriptException("Unable to load IPTV playlist: " + playlist.url);
}

function getPlaylistCandidateUrls(playlist) {
  const urls = [];
  const mirrorBase = getMirrorBaseUrl();
  if (mirrorBase.length > 0) {
    urls.push(mirrorBase + "/" + playlist.key + ".m3u");
  }
  urls.push(playlist.url);
  return urls;
}

function getMirrorBaseUrl() {
  const configured = safeString(pluginSettings.playlistMirrorBase).replace(/\/+$/, "");
  if (configured.length > 0) {
    return configured;
  }
  const sourceUrl = safeString(config.sourceUrl);
  if (sourceUrl.length === 0) {
    return "";
  }
  const match = /^(https?:\/\/[^/]+(?:\/.*)?)\/[^/]+$/.exec(sourceUrl);
  if (!match) {
    return "";
  }
  return match[1].replace(/\/+$/, "") + "/mirror";
}

function parseExtInfLine(line) {
  const info = {
    name: "",
    groupTitle: "",
    tvgId: "",
    tvgLogo: "",
    tvgCountry: "",
    tvgLanguage: "",
    httpUserAgent: ""
  };
  const commaIndex = line.lastIndexOf(",");
  info.name = commaIndex >= 0 ? line.substring(commaIndex + 1).trim() : "";

  const attributesPart = commaIndex >= 0 ? line.substring(0, commaIndex) : line;
  const attrRegex = /([A-Za-z0-9_-]+)="([^"]*)"/g;
  let match = attrRegex.exec(attributesPart);
  while (match) {
    const key = match[1];
    const value = match[2];
    if (key === "group-title") info.groupTitle = value;
    if (key === "tvg-id") info.tvgId = value;
    if (key === "tvg-logo") info.tvgLogo = value;
    if (key === "tvg-country") info.tvgCountry = value;
    if (key === "tvg-language") info.tvgLanguage = value;
    if (key === "http-user-agent") info.httpUserAgent = value;
    match = attrRegex.exec(attributesPart);
  }
  return info;
}

function entryToPlatformVideo(entry) {
  return new PlatformVideo({
    id: makePlatformId("stream:" + entry.id),
    name: entry.name,
    thumbnails: buildThumbnails(entry.logo),
    author: buildAuthor(entry),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    url: normalizeDetailsUrl(entry.playlistKey, entry.id),
    isLive: true
  });
}

function groupToPlatformChannel(playlist, group) {
  return new PlatformChannel({
    id: makePlatformId("group:" + playlist.key + ":" + group.slug),
    name: group.name,
    thumbnail: firstNonEmpty(group.logo, ""),
    banner: firstNonEmpty(group.logo, ""),
    subscribers: group.count,
    description: group.count + " channels from the " + playlist.name + " legal IPTV playlist.",
    url: normalizeChannelUrl(playlist.key, group.slug),
    links: []
  });
}

function buildAuthor(entry) {
  return new PlatformAuthorLink(
    makePlatformId("group:" + entry.playlistKey + ":" + entry.groupSlug),
    entry.groupName,
    normalizeChannelUrl(entry.playlistKey, entry.groupSlug),
    firstNonEmpty(entry.logo, ""),
    0
  );
}

function buildThumbnails(logoUrl) {
  const items = [];
  if (logoUrl) {
    items.push(new Thumbnail(logoUrl, 512));
  }
  return new Thumbnails(items);
}

function buildPlayback(entry) {
  const url = safeString(entry.streamUrl);
  let hls = null;
  let dash = null;
  let live = null;
  let descriptor = null;

  if (/\.m3u8(?:$|\?)/i.test(url)) {
    hls = new HLSSource({ name: "Live HLS", duration: 0, url: url });
    live = hls;
    descriptor = new VideoSourceDescriptor([hls]);
  } else if (/\.mpd(?:$|\?)/i.test(url)) {
    dash = new DashSource({ name: "Live DASH", duration: 0, url: url });
    live = dash;
    descriptor = new VideoSourceDescriptor([dash]);
  } else {
    descriptor = new VideoSourceDescriptor([
      new VideoUrlSource({
        width: 0,
        height: 0,
        container: inferContainer(url),
        codec: "unknown",
        name: "Live stream",
        bitrate: 0,
        duration: 0,
        url: url
      })
    ]);
  }

  return {
    descriptor: descriptor,
    hls: hls,
    dash: dash,
    live: live
  };
}

function buildDescription(entry) {
  const lines = [
    "Playlist: " + entry.playlistName,
    "Group: " + entry.groupName
  ];
  if (entry.language) {
    lines.push("Language: " + entry.language);
  }
  if (entry.country) {
    lines.push("Country: " + entry.country);
  }
  if (entry.tvgId) {
    lines.push("TVG ID: " + entry.tvgId);
  }
  lines.push("Stream: " + entry.streamUrl);
  return lines.join("\n");
}

function matchesQuery(entry, lowered) {
  const haystack = [
    entry.name,
    entry.groupName,
    entry.country,
    entry.language,
    entry.tvgId
  ].join(" ").toLowerCase();
  return haystack.indexOf(lowered) !== -1;
}

function normalizeDetailsUrl(playlistKey, entryId) {
  return WATCH_PREFIX + encodeURIComponent(playlistKey) + "/" + encodeURIComponent(entryId);
}

function normalizeChannelUrl(playlistKey, groupSlug) {
  return CHANNEL_PREFIX + encodeURIComponent(playlistKey) + "/" + encodeURIComponent(groupSlug);
}

function parseDetailsUrl(url) {
  const match = /^https:\/\/iptv-org\.github\.io\/iptv\/watch\/([^/]+)\/([^/?#]+)$/.exec(safeString(url));
  if (!match) {
    throw new ScriptException("Invalid IPTV details URL: " + url);
  }
  return {
    playlistKey: decodeURIComponent(match[1]),
    entryId: decodeURIComponent(match[2])
  };
}

function parseChannelUrl(url) {
  const match = /^https:\/\/iptv-org\.github\.io\/iptv\/channel\/([^/]+)\/([^/?#]+)$/.exec(safeString(url));
  if (!match) {
    throw new ScriptException("Invalid IPTV channel URL: " + url);
  }
  return {
    playlistKey: decodeURIComponent(match[1]),
    groupSlug: decodeURIComponent(match[2])
  };
}

function findEntryById(entries, id) {
  if (id === "__sample__") {
    return entries.length > 0 ? entries[0] : null;
  }
  for (let i = 0; i < entries.length; i += 1) {
    if (entries[i].id === id) {
      return entries[i];
    }
  }
  return null;
}

function findGroupBySlug(groups, slug) {
  if (slug === "__sample__") {
    return groups.length > 0 ? groups[0] : null;
  }
  for (let i = 0; i < groups.length; i += 1) {
    if (groups[i].slug === slug) {
      return groups[i];
    }
  }
  return null;
}

function getPageFromToken(token) {
  if (!token) {
    return 1;
  }
  const page = parseInt(String(token), 10);
  return Number.isNaN(page) || page < 1 ? 1 : page;
}

function inferContainer(url) {
  if (/\.mp4(?:$|\?)/i.test(url)) return "video/mp4";
  if (/\.ts(?:$|\?)/i.test(url)) return "video/mp2t";
  if (/\.mp3(?:$|\?)/i.test(url)) return "audio/mpeg";
  if (/\.aac(?:$|\?)/i.test(url)) return "audio/aac";
  return "application/octet-stream";
}

function compareStrings(a, b) {
  const left = safeString(a).toLowerCase();
  const right = safeString(b).toLowerCase();
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function hashText(text) {
  let hash = 5381;
  const value = safeString(text);
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  if (hash < 0) {
    hash = 0xffffffff + hash + 1;
  }
  return hash.toString(16);
}

function slugify(value) {
  const slug = safeString(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "general";
}

function makePlatformId(id) {
  return new PlatformID(PLATFORM, id, config.id);
}

function firstNonEmpty() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = safeString(arguments[i]);
    if (value.length > 0) {
      return value;
    }
  }
  return "";
}

function safeString(value, fallback) {
  if (value === null || value === undefined) {
    return fallback === undefined ? "" : String(fallback);
  }
  return String(value);
}
