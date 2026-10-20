# Fixproof ticket format (v1)

A ticket is a GitHub issue in the project's tasks repository. The body has two parts:

1. **Human part** (Markdown): what is wrong, the page, the screenshot, a short context table.
2. **Machine part**: one HTML comment at the end of the body, invisible on GitHub:

```
<!-- fixproof:v1
{ ...JSON... }
-->
```

Writers: the Chrome extension (and any future client). Readers: `fixproof show`, the agent skill.
Manual issues without the block are valid; the reader falls back to the first URL in the text.

## JSON

```json
{
  "v": 1,
  "url": "https://example.com/contact/",
  "pageTitle": "Contact us - Example",
  "kind": "element",                       // element | area | page
  "viewport": { "w": 1440, "h": 900, "dpr": 2 },
  "device": "desktop",                     // desktop | mobile (width < 768 or touch)
  "browser": "Chrome 141",
  "os": "macOS",
  "lang": "en",
  "scroll": { "x": 0, "y": 1320 },
  "element": {                             // kind = element
    "selector": "#contact .card:nth-of-type(2) b",
    "text": "+1 555 0100",
    "html": "<b class=\"phone\">+1 555 0100</b>",   // outerHTML, max 1000 chars
    "rect": { "x": 412, "y": 233, "w": 160, "h": 28 }   // viewport coordinates at capture time
  },
  "area": { "x": 0, "y": 0, "w": 0, "h": 0 },        // kind = area, viewport coordinates
  "console": [ { "level": "error", "text": "…", "at": "2026-10-20T10:00:01Z" } ],   // last 20
  "network": [ { "url": "…", "status": 404, "type": "img" } ],                      // failed only, last 20
  "screenshots": [ "screenshots/12/before.jpg" ],    // paths in the tasks repo
  "reporter": "dana",
  "createdAt": "2026-10-20T10:00:05Z",
  "client": "fixproof-extension/0.1.0"
}
```

## Screenshots

Stored in the tasks repository itself, `screenshots/<issue>/<name>.jpg`, committed through the contents API.
They render in private repositories for anyone with access (`…/blob/main/<path>?raw=true`) and need no
third-party storage. Names: `before*.jpg` from the reporter, `after-<viewport>.jpg` from the fix.

## Labels (the workflow)

| Label | Set by | Meaning |
|---|---|---|
| `status: new` | client | reported |
| `status: in progress` | `fixproof claim` | taken; the time of this label starts the work timer |
| `status: needs info` | `fixproof ask` | question back to the reporter |
| `status: fixed on test` | `fixproof done` | fixed, "after" screenshots attached, waiting for a human |
| closed | a human | checked and accepted (reopen = not fixed) |

Plus `type: bug | design | content | request`, `priority: high`, `device: mobile | desktop`.

## Project config: `.fixproof.json`

In the root of the code project (found by walking up from the working directory):

```json
{
  "repo": "acme/example-site-tasks",
  "lang": "en",
  "sites": {
    "local": "http://example.local",
    "test": "https://staging.example.com",
    "live": "https://example.com"
  },
  "reproduceOn": "local",
  "deploy": { "test": "https://staging.example.com", "live": "never without the owner's yes" },
  "notes": "Theme in theme/, run npm run build after CSS changes."
}
```

A ticket URL on the live or test origin is mapped to the same path on `reproduceOn` for reproducing and for
the "after" screenshots.
