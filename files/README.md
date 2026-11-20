# Live Basketball Scoreboard for OBS

A static, no-build scoreboard. `index.html` is the controller, `overlay.html` is the 1920×1080 transparent OBS Browser Source.

## Files

| File | Purpose |
|---|---|
| `index.html` | Controller (works on phone, tablet, desktop) |
| `overlay.html` | Transparent broadcast view for OBS |
| `style.css` | All styling, with the overlay's coordinates in CSS variables at the top |
| `app.js` | Shared logic: state, clocks, sync, hotkeys |

## Deploy on GitHub Pages

1. Create a new GitHub repository (public, for free Pages hosting).
2. Upload `index.html`, `overlay.html`, `style.css`, `app.js` and `README.md` to the repository root.
3. Go to **Settings → Pages**. Under **Build and deployment**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, then **Save**.
4. After a minute your site is live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

## Set up OBS

1. Open the controller (`.../YOUR-REPO/`) on your phone or tablet.
2. Copy the **overlay link** shown in the Connection card. It looks like `.../overlay.html?room=4821`.
3. In OBS: **Sources → + → Browser**, paste the link, set **Width 1920, Height 1080**. Leave the custom CSS box as is (the page is already transparent).
4. Keep the controller page open while broadcasting. The overlay reconnects automatically if the connection drops.

Useful overlay URL options: `?names=full` shows full team names instead of abbreviations, and `?preview` adds a green background so you can see it in a normal browser tab.

## How syncing works

- **Peer-to-peer (PeerJS):** the controller creates a room named by the 4-digit code. The overlay with the matching `?room=` connects to it. The free PeerJS cloud server only introduces the two devices; scoreboard data travels directly between them.
- **localStorage:** if the controller and overlay are open in the same browser on the same device, they sync with no room code at all. Note that **OBS's browser source has its own storage**, so it is *not* shared with Chrome. When OBS is involved, use the room link.
- **Caveats:** some school, office or mobile networks block peer-to-peer traffic. If the overlay won't connect, put both devices on the same Wi-Fi or use a phone hotspot. Room codes are not passwords, so pick a different code if someone else could guess yours. The clocks run on the overlay from timestamps, so they stay smooth even if the phone screen dims, but keep the controller tab open and awake.

## Customize the look

Open `style.css` and edit the variables at the top (`:root`). Positions are in pixels, measured from the top-left of the scorebug box (`--bug-x`, `--bug-y` place the box on the 1920×1080 canvas).

**Using your own Affinity Designer graphics:**

- *In the page:* export a PNG sized to the bug (default 900×110), save it as `assets/scorebug.png`, then set `--bug-img: url("assets/scorebug.png");` and `--bug-bg: none;`.
- *In OBS:* alternatively, leave `--bug-bg: none;` and stack your PNG as an Image source *below* the Browser Source.

Then nudge `--away-score-x`, `--clock-y`, `--clock-size` and the other variables until the numbers sit exactly on your artwork. The spotlight card (`--spot-*`) and shot clock (`--shot-*`) have their own variables and background (`--spot-bg`).

## Hotkeys (desktop controller)

| Key | Action |
|---|---|
| `Space` | Start/stop game clock (shot clock follows when the checkbox is on) |
| `R` / `T` | Shot clock reset to 24 / 14 |
| `,` / `.` | Game clock −1s / +1s |
| `1`–`4`, `0` | Period 1ST–4TH, OT |
| `P` | Show/hide player spotlight |
| `A` `S` `D` / `Z` | Away +1 / +2 / +3 / −1 |
| `J` `K` `L` / `M` | Home +1 / +2 / +3 / −1 |

Hotkeys are disabled while you are typing in a text box.

## Notes

- Game clock input accepts `12:00`, `5:30`, or plain seconds like `45.5`.
- The game clock shows tenths of a second under 1:00. Both clocks stop automatically at zero.
- Team fouls light up red at 5 (bonus). Timeouts show as dots, 7 per team by default.
- PeerJS loads from the jsDelivr CDN, so the pages need internet access.
