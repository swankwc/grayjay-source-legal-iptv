const PLATFORM = "Legal IPTV";
const BASE_URL = "https://iptv-org.github.io/iptv/";
const WATCH_PREFIX = BASE_URL + "watch/";
const CHANNEL_PREFIX = BASE_URL + "channel/";
const PAGE_SIZE = 40;
const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_CACHE_TTL_MS = 60 * 60 * 1000;

const PLAYLISTS = [
  // iptv-org by category
  { key: "all",           name: "All Legal Channels",         url: BASE_URL + "index.m3u" },
  { key: "eng",           name: "English",                    url: BASE_URL + "languages/eng.m3u" },
  { key: "spa",           name: "Spanish / Español",          url: BASE_URL + "languages/spa.m3u" },
  { key: "fra",           name: "French / Français",          url: BASE_URL + "languages/fra.m3u" },
  { key: "por",           name: "Portuguese / Português",     url: BASE_URL + "languages/por.m3u" },
  { key: "ara",           name: "Arabic / العربية",           url: BASE_URL + "languages/ara.m3u" },
  { key: "zho",           name: "Chinese / 中文",             url: BASE_URL + "languages/zho.m3u" },
  { key: "hin",           name: "Hindi / हिन्दी",             url: BASE_URL + "languages/hin.m3u" },
  { key: "us",            name: "United States",              url: BASE_URL + "countries/us.m3u" },
  { key: "gb",            name: "United Kingdom",             url: BASE_URL + "countries/gb.m3u" },
  { key: "ca",            name: "Canada",                     url: BASE_URL + "countries/ca.m3u" },
  { key: "au",            name: "Australia",                  url: BASE_URL + "countries/au.m3u" },
  { key: "movies",        name: "Movies",                     url: BASE_URL + "categories/movies.m3u" },
  { key: "series",        name: "Series",                     url: BASE_URL + "categories/series.m3u" },
  { key: "kids",          name: "Kids",                       url: BASE_URL + "categories/kids.m3u" },
  { key: "news",          name: "News",                       url: BASE_URL + "categories/news.m3u" },
  { key: "sports",        name: "Sports",                     url: BASE_URL + "categories/sports.m3u" },
  { key: "music",         name: "Music",                      url: BASE_URL + "categories/music.m3u" },
  { key: "documentary",   name: "Documentary",                url: BASE_URL + "categories/documentary.m3u" },
  { key: "entertainment", name: "Entertainment",              url: BASE_URL + "categories/entertainment.m3u" },
  { key: "religious",     name: "Religious",                  url: BASE_URL + "categories/religious.m3u" },
  // Free-TV curated list (https://github.com/Free-TV/IPTV) — genuinely free, no geo-block
  { key: "freetv",        name: "Free-TV Curated",            url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8" },
];

let config = {};
let pluginSettings = {};
let playlistCache = {};
let epgCache = {};

source.enable = function(conf, settings, savedState) {
  config = (conf !== null && conf !== undefined) ? conf : {};
  pluginSettings = (settings !== null && settings !== undefined) ? settings : {};
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
  if (!query || query.trim().length < 2) return [];
  const playlist = getActivePlaylist();
  const lowered = query.trim().toLowerCase();
  const seen = {};
  const suggestions = [];
  const entries = getEntries(playlist);
  for (let i = 0; i < entries.length && suggestions.length < 8; i++) {
    const name = entries[i].name;
    const key = name.toLowerCase();
    if (key.indexOf(lowered) === 0 && !seen[key]) {
      seen[key] = true;
      suggestions.push(name);
    }
  }
  // Also suggest matching group names
  const groups = getGroups(playlist);
  for (let i = 0; i < groups.length && suggestions.length < 12; i++) {
    const g = groups[i].name;
    const key = g.toLowerCase();
    if (key.indexOf(lowered) === 0 && !seen[key]) {
      seen[key] = true;
      suggestions.push(g);
    }
  }
  return suggestions;
};

source.getSearchCapabilities = function() {
  return {
    types: [Type.Feed.Mixed, Type.Feed.Streams],
    sorts: [Type.Order.Chronological],
    filters: [
      {
        id: "type",
        name: "Type",
        isMultiSelect: false,
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
      }
    ]
  };
};

source.search = function(query, type, order, filters, continuationToken) {
  const playlist = getActivePlaylist();
  const page = getPageFromToken(continuationToken);
  const lowered = safeString(query).trim().toLowerCase();

  const typeFilter = filters && filters.type ? safeString(filters.type).toLowerCase() : "";

  const results = getEntries(playlist).filter(function(entry) {
    if (lowered.length > 0 && !matchesQuery(entry, lowered)) return false;
    if (typeFilter.length > 0) {
      if (typeFilter === "live") {
        if (isVod(entry)) return false;
      } else {
        if (entry.groupName.toLowerCase().indexOf(typeFilter) === -1) return false;
      }
    }
    return true;
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
    filters: [
      {
        id: "type",
        name: "Type",
        isMultiSelect: false,
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
      }
    ]
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

  const typeFilter = filters && filters.type ? safeString(filters.type).toLowerCase() : "";

  const entries = getEntries(playlist).filter(function(entry) {
    if (entry.groupSlug !== channelRef.groupSlug) return false;
    if (lowered.length > 0 && !matchesQuery(entry, lowered)) return false;
    if (typeFilter.length > 0) {
      if (typeFilter === "live") {
        if (isVod(entry)) return false;
      } else {
        if (entry.groupName.toLowerCase().indexOf(typeFilter) === -1) return false;
      }
    }
    return true;
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
    filters: [
      {
        id: "type",
        name: "Type",
        isMultiSelect: false,
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
      }
    ]
  };
};

source.getChannelContents = function(url, type, order, filters, continuationToken) {
  const channelRef = parseChannelUrl(url);
  const playlist = getPlaylistByKey(channelRef.playlistKey);
  const page = getPageFromToken(continuationToken);

  const typeFilter = filters && filters.type ? safeString(filters.type).toLowerCase() : "";

  const entries = getEntries(playlist).filter(function(entry) {
    if (entry.groupSlug !== channelRef.groupSlug) return false;
    if (typeFilter.length > 0) {
      if (typeFilter === "live") {
        if (isVod(entry)) return false;
      } else {
        if (entry.groupName.toLowerCase().indexOf(typeFilter) === -1) return false;
      }
    }
    return true;
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

  const vod = isVod(entry);
  const playback = buildPlayback(entry);
  return new PlatformVideoDetails({
    id: makePlatformId("stream:" + entry.id),
    name: entry.name,
    thumbnails: buildThumbnails(entry.logo),
    author: buildAuthor(entry),
    uploadDate: 0,
    duration: vod ? -1 : 0,
    viewCount: 0,
    url: normalizeDetailsUrl(entry.playlistKey, entry.id),
    isLive: !vod,
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

function LegalIptvVideoPager(results, hasMore, context) {
  VideoPager.call(this, results, hasMore, context);
}
LegalIptvVideoPager.prototype = Object.create(VideoPager.prototype);
LegalIptvVideoPager.prototype.constructor = LegalIptvVideoPager;
LegalIptvVideoPager.prototype.nextPage = function() {
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
};

function LegalIptvChannelPager(results, hasMore, context) {
  ChannelPager.call(this, results, hasMore, context);
}
LegalIptvChannelPager.prototype = Object.create(ChannelPager.prototype);
LegalIptvChannelPager.prototype.constructor = LegalIptvChannelPager;
LegalIptvChannelPager.prototype.nextPage = function() {
  return source.searchChannels(this.context.query, this.context.page);
};

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
  let entries;

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    entries = cached.entries;
  } else {
    try {
      entries = fetchPlaylistEntries(playlist);
      playlistCache[cacheKey] = {
        timestamp: now,
        entries: entries
      };
    } catch (error) {
      if (cached && now - cached.timestamp < STALE_CACHE_TTL_MS) {
        entries = cached.entries;
      } else {
        throw error;
      }
    }
  }

  return applyFilters(entries);
}

function applyFilters(entries) {
  if (!entries) return [];

  const typeIdx = parseInt(safeString(pluginSettings.contentTypeFilter, "0"), 10);
  const langIdx = parseInt(safeString(pluginSettings.languageFilter, "0"), 10);
  const countryIdx = parseInt(safeString(pluginSettings.countryFilter, "0"), 10);
  const hideUndef = safeString(pluginSettings.hideUndefined, "false") === "true";
  const resIdx = parseInt(safeString(pluginSettings.resolutionFilter, "0"), 10);

  return entries.filter(function(entry) {
    // Hide undefined
    if (hideUndef && entry.groupName === "IPTV") return false;

    // Content Type Filter
    if (typeIdx > 0) {
      const typeMap = ["", "live", "movies", "series", "kids", "sports", "news", "music", "documentary"];
      const target = typeMap[typeIdx];
      if (target === "live") {
        if (isVod(entry)) return false;
      } else {
        if (entry.groupName.toLowerCase().indexOf(target) === -1) return false;
      }
    }

    // Language Filter
    if (langIdx > 0) {
      const langMap = ["", "eng", "spa", "fra", "por", "ara", "zho", "hin"];
      if (langIdx < langMap.length) {
        const target = langMap[langIdx];
        if (entry.language.toLowerCase().indexOf(target) === -1) return false;
      } else {
        // "Other"
        const knownLangs = ["eng", "spa", "fra", "por", "ara", "zho", "hin"];
        let isKnown = false;
        for (let i = 0; i < knownLangs.length; i++) {
          if (entry.language.toLowerCase().indexOf(knownLangs[i]) !== -1) {
            isKnown = true;
            break;
          }
        }
        if (isKnown) return false;
      }
    }

    // Country Filter
    if (countryIdx > 0) {
      const countryMap = ["", "us", "gb", "ca", "au"];
      if (countryIdx < countryMap.length) {
        const target = countryMap[countryIdx];
        if (entry.country.toLowerCase().indexOf(target) === -1) return false;
      } else {
        // "Other"
        const knownCountries = ["us", "gb", "ca", "au"];
        let isKnown = false;
        for (let i = 0; i < knownCountries.length; i++) {
          if (entry.country.toLowerCase().indexOf(knownCountries[i]) !== -1) {
            isKnown = true;
            break;
          }
        }
        if (isKnown) return false;
      }
    }

    // Resolution Filter
    if (resIdx > 0) {
      const nameRaw = entry.nameRaw.toLowerCase();
      if (resIdx === 1 && nameRaw.indexOf("1080p") === -1) return false;
      if (resIdx === 2 && nameRaw.indexOf("720p") === -1) return false;
      if (resIdx === 3) {
        const sdTags = ["576p", "480p", "270p"];
        let hasSD = false;
        for (let i = 0; i < sdTags.length; i++) {
          if (nameRaw.indexOf(sdTags[i]) !== -1) {
            hasSD = true;
            break;
          }
        }
        if (!hasSD) return false;
      }
    }

    return true;
  });
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

    const originalName = firstNonEmpty(pending.name, "Untitled channel");
    const qualityMatch = /\((\d{3,4}p)\)/.exec(originalName);
    const quality = qualityMatch ? qualityMatch[1] : "";
    const cleanName = originalName.replace(/\s*\(\d{3,4}p\)\s*$/, "").trim() || originalName;

    entries.push({
      id: entryId,
      playlistKey: playlist.key,
      playlistName: playlist.name,
      name: cleanName,
      nameRaw: originalName,
      quality: quality,
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
  const vod = isVod(entry);
  return new PlatformVideo({
    id: makePlatformId("stream:" + entry.id),
    name: entry.name,
    thumbnails: buildThumbnails(entry.logo),
    author: buildAuthor(entry),
    uploadDate: 0,
    duration: vod ? -1 : 0,
    viewCount: 0,
    url: normalizeDetailsUrl(entry.playlistKey, entry.id),
    isLive: !vod
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

function fetchEpgForDomain(domain) {
  const cacheKey = domain;
  const now = Date.now();
  if (epgCache[cacheKey] && now - epgCache[cacheKey].timestamp < CACHE_TTL_MS) {
    return epgCache[cacheKey].data;
  }

  try {
    const url = "https://iptv-org.github.io/epg/guides/" + domain + ".xml";
    const response = http.GET(url, {}, false);
    if (!response || !response.isOk) {
      throw new Error("EPG not found for " + domain);
    }
    const epgData = parseXmltvBody(response.body);
    epgCache[cacheKey] = {
      timestamp: now,
      data: epgData
    };
    return epgData;
  } catch (e) {
    log("EPG fetch failed for " + domain + ": " + e.message);
    if (epgCache[cacheKey]) return epgCache[cacheKey].data;
    return null;
  }
}

function getEpgNow(entry) {
  if (!entry.tvgId || entry.tvgId.indexOf("@") === -1) return null;
  const domain = entry.tvgId.split("@")[0];
  const epgData = fetchEpgForDomain(domain);
  if (!epgData) return null;

  const channelId = entry.tvgId;
  const programs = epgData.filter(function(p) { return p.channelId === channelId; });
  if (programs.length === 0) return null;

  const now = new Date();
  let current = null;
  let next = null;

  for (let i = 0; i < programs.length; i++) {
    const p = programs[i];
    if (now >= p.start && now < p.stop) {
      current = p;
      if (i + 1 < programs.length) {
        next = programs[i + 1];
      }
      break;
    }
  }

  return { current: current, next: next };
}

function parseXmltvBody(body) {
  const programs = [];
  const progRegex = /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/g;
  const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/;
  const descRegex = /<desc[^>]*>([\s\S]*?)<\/desc>/;

  let match;
  while ((match = progRegex.exec(body)) !== null) {
    const attrs = match[1];
    const content = match[2];

    const startMatch = /start="([^"]+)"/.exec(attrs);
    const stopMatch = /stop="([^"]+)"/.exec(attrs);
    const channelMatch = /channel="([^"]+)"/.exec(attrs);

    if (startMatch && stopMatch && channelMatch) {
      const titleMatch = titleRegex.exec(content);
      const descMatch = descRegex.exec(content);

      programs.push({
        channelId: channelMatch[1],
        start: parseXmltvDate(startMatch[1]),
        stop: parseXmltvDate(stopMatch[1]),
        title: titleMatch ? decodeXmlEntities(titleMatch[1]) : "Untitled",
        desc: descMatch ? decodeXmlEntities(descMatch[1]) : ""
      });
    }
  }
  return programs;
}

function parseXmltvDate(str) {
  // Format: 20260310120000 +0000
  const y = parseInt(str.substring(0, 4));
  const m = parseInt(str.substring(4, 6)) - 1;
  const d = parseInt(str.substring(6, 8));
  const h = parseInt(str.substring(8, 10));
  const min = parseInt(str.substring(10, 12));
  const s = parseInt(str.substring(12, 14));
  return new Date(Date.UTC(y, m, d, h, min, s));
}

function decodeXmlEntities(str) {
  return str.replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"")
            .replace(/&apos;/g, "'");
}

function buildDescription(entry) {
  const lines = [];

  try {
    const epg = getEpgNow(entry);
    if (epg && epg.current) {
      lines.push("NOW: " + epg.current.title);
      if (epg.next) {
        lines.push("NEXT: " + epg.next.title);
      }
      lines.push("");
    }
  } catch (e) {
    // Ignore EPG errors
  }

  lines.push("Playlist: " + entry.playlistName);
  lines.push("Group: " + entry.groupName);

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

function isVod(entry) {
  const group = entry.groupName.toLowerCase();
  return group.indexOf("movies") !== -1 || group.indexOf("series") !== -1;
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
