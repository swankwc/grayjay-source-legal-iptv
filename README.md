# Legal IPTV Grayjay Source

Copyright (C) 2026 Wesley Swank

Licensed under AGPL-3.0-or-later. See `LICENSE`.

This repository hosts a Grayjay plugin for legal IPTV playlists.

Current scope:

- Home feed from curated legal IPTV playlists
- Search within the selected playlist
- Group-title buckets exposed as Grayjay channels
- Channel contents and live stream details
- Local playlist mirror hosted on GitHub Pages to avoid Android DNS issues

Intentional release limits:

- No private IPTV support
- No EPG or guide integration
- No login or user sync
- Comments, recommendations, playlists, and history remain minimal-safe stubs

## Files

- `LegalIptvConfig.json`
- `LegalIptvScript.js`
- `icon.svg`
- `mirror/*.m3u`

## Install URL

After GitHub Pages is enabled, install from:

```text
https://swankwc.github.io/grayjay-source-legal-iptv/LegalIptvConfig.json
```

## Pages setup

1. Create or use the public repository `grayjay-source-legal-iptv`.
2. Push these files to the repository root.
3. In GitHub Pages, deploy from `main` and `/ (root)`.
4. Wait for Pages to publish.

## Release notes

- The plugin prefers the GitHub Pages-hosted `mirror/` playlists first.
- It can still fall back to `iptv-org.github.io` if needed.
- Update the mirrored playlist files when IPTV-org changes materially.
