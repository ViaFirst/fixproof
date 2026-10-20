# Fixproof for Chrome

Mark a bug on any website and get a ticket your AI coding agent can act on.

Click the toolbar button (or press **Alt+Shift+B**), pick the broken element, an area or the whole screen,
draw on the screenshot, write a title — Fixproof creates a GitHub issue with everything a developer (or an agent
such as Claude Code, Cursor or Codex) needs to reproduce it:

- the annotated screenshot, committed to your tasks repository;
- page URL, CSS selector, text and HTML of the element, its position;
- viewport, device type, browser and OS;
- console errors and warnings, and failed network requests (from page load, on sites you allow);
- a machine-readable `fixproof:v1` block, so tools can parse the ticket (see [docs/TICKET-FORMAT.md](docs/TICKET-FORMAT.md)).

The interface is in English, Russian and Hebrew (right-to-left).

## Install (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `extension` folder.

## Set up

1. Create a **private** GitHub repository for the tasks of a site, e.g. `you/site-tasks`.
2. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) limited to that repository with
   **Issues: Read and write** and **Contents: Read and write**.
3. Open the extension's settings (they open on install): paste the token, add your name, add a project —
   its tasks repository and the site addresses (live, staging, local) — then **Test connection** and **Save**.
4. Optional: **Collect console errors on these sites** gives the extension access to those sites only, so errors are
   recorded from page load.

The token is stored only in this browser (`chrome.storage.local`) and is sent only to `api.github.com`.

## Use

- **Alt+Shift+B** or the toolbar button starts a report; a second click closes it.
- Element mode: hover and click; **↑** selects the parent block, **↓** goes back, **Enter** takes it, **Esc** cancels.
- Area mode: drag a rectangle. Whole screen: one click.
- In the editor: box, arrow and pen, undo; then title, details, type and priority.

Tickets get the labels `status: new`, `type: …`, `device: …` (and `priority: high`). The suggested workflow:
`status: new` → `status: in progress` → `status: fixed on test` (with "after" screenshots) → a human closes the issue.

## Backends

Tickets go to GitHub Issues today. Sending is behind a small interface (`extension/src/backends/`), so other
trackers or a self-hosted server can be added without touching the capture side.

## Licence

MIT, see [LICENSE](LICENSE).
