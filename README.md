# Legal IPTV Grayjay Source

Browse 20+ curated legal free IPTV playlists inside Grayjay. Live TV, Movies, Series, Kids, Sports, News, Music, Documentary — filterable by language, country, and content type. EPG guide data where available.

## Install URL

Install this plugin by pasting the following URL into Grayjay:

```text
https://swankwc.github.io/grayjay-source-legal-iptv/LegalIptvConfig.json
```

## Features

- **20+ Curated Playlists**: Access channels by language, country, and category.
- **EPG Guide Data**: Rich program information (current/next) enriched via iptv-org XMLTV data.
- **Filters**: Limit results by Language, Country, Content Type (Live/VOD), and Resolution (1080p/720p/SD).
- **Search Autocomplete**: Fast suggestions for channels and group names.
- **Quality Aware**: Automatically strips quality tags from names for a cleaner UI while preserving them for filtering.
- **Mirror Support**: Built-in mirror support for improved reliability.

## Sources

This plugin aggregates content from the following upstream projects:

- **iptv-org/iptv**: [https://github.com/iptv-org/iptv](https://github.com/iptv-org/iptv)
- **iptv-org/epg**: [https://github.com/iptv-org/epg](https://github.com/iptv-org/epg)
- **Free-TV/IPTV**: [https://github.com/Free-TV/IPTV](https://github.com/Free-TV/IPTV)

## Settings Reference

| Variable | Name | Options | Default |
|---|---|---|---|
| `homeFeedIndex` | Home Feed | 22 Playlists | English |
| `maxHomeCountIndex` | Home Feed Size | 50, 100, 200, 400 | 100 |
| `contentTypeFilter` | Content Type Filter | All, Live, Movies, Series, etc. | All types |
| `languageFilter` | Language Filter | Any, English, Spanish, etc. | Any language |
| `countryFilter` | Country Filter | Any, US, UK, Canada, Australia, etc. | Any country |
| `hideUndefined` | Hide Uncategorised | Boolean | false |
| `resolutionFilter` | Resolution Filter | Any, 1080p, 720p, SD | Any resolution |
| `playlistMirrorBase` | Custom Mirror Base | TextField | (blank) |

## Developer

### Signing Workflow

1. Edit `LegalIptvScript.js`.
2. Run the `sign-plugin` tool (provided by Grayjay — see [https://grayjay.app/developer](https://grayjay.app/developer)).
3. Paste the generated `scriptSignature` and `scriptPublicKey` into `LegalIptvConfig.json`.
4. Commit and push both files.
5. Wait for GitHub Pages to republish.

### Mirror Update

To refresh the `mirror/*.m3u` files, copy the corresponding playlist content from the `iptv-org` repository into the respective file in the `mirror/` directory.

---

Copyright (C) 2026 Wesley Swank — AGPL-3.0-or-later
