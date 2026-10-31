# Telegram Media Bot

A Telegram bot that downloads media from shared links and sends it directly
to the chat. It supports:

- **Instagram:** photos, videos, and posts containing multiple media items.
- **TikTok:** videos and photo posts, including `tt.site` short links.
- **YouTube:** Shorts links and `youtu.be` links.
- **`/trap`:** a random image from an external service.

After sending the media, the bot attempts to delete the original link message.
In groups, give it permission to read messages and delete them. Replies are
currently in Russian, and some contain profanity.

## Technology stack

- **JavaScript and Node.js** — application runtime.
- **node-telegram-bot-api** — Telegram integration using long polling.
- **Axios** — requests to media services.
- **Cheerio** — extracts video links from HTML for the TikTok fallback.
- **dotenv** — loads local environment variables from `.env`.
- **Node.js HTTP server** — provides the `/health` endpoint.
- **Node.js test runner** — automated tests.

Instagram downloads use RapidAPI. YouTube Shorts use Apify. TikTok uses TikWM,
with [fxTikTok](https://github.com/okdargy/fxTikTok) as a fallback.

## Run locally

1. Install **Node.js 18.17 or newer** and npm.
2. Download this repository and extract it, or clone it:

   ```sh
   git clone https://github.com/tireddwarf99/telegram-bot.git
   cd telegram-bot
   ```

3. Open a terminal in the project folder and install the dependencies:

   ```sh
   npm ci
   ```

4. Create a Telegram bot through **@BotFather** and obtain its token.
5. Copy `.env.example` to a file named `.env` in the project root. Fill in
   the values described below.
6. Start the bot:

   ```sh
   npm start
   ```

7. Open your bot in Telegram and send a supported link. For Instagram and
   YouTube, send the link as a standalone message.

Keep the process running while you use the bot. Press `Ctrl+C` to stop it.
Run only one instance per Telegram token to avoid polling conflicts.

## Environment variables

These are credentials and settings, not npm dependencies. The JavaScript
dependencies are installed by `npm ci`, using the versions in `package-lock.json`.

| Variable | Required for | Value |
| --- | --- | --- |
| `TELEGRAM_API` | Main bot | Your Telegram bot token from @BotFather. |
| `RAPID_API_KEY` | Instagram | A RapidAPI key with access to Instagram Looter2. |
| `RAPID_API_HOST` | Instagram | `instagram-looter2.p.rapidapi.com` |
| `APIFY_API_TOKEN` | YouTube | Apify API token configured in Render. |
| `TELEGRAM_API_TEST` | Optional live test bot | A separate Telegram bot token. |
| `PORT` | Optional HTTP setting | Health server port; defaults to `3000` for the main bot and `3001` for the test bot. |

Example `.env`:

```dotenv
TELEGRAM_API=your_main_telegram_bot_token

# Instagram: enable access to Instagram Looter2 on RapidAPI.
RAPID_API_KEY=your_rapidapi_key
RAPID_API_HOST=instagram-looter2.p.rapidapi.com

# YouTube Shorts via Apify
APIFY_API_TOKEN=your_apify_token_here

# Optional: separate bot for live testing.
TELEGRAM_API_TEST=your_test_telegram_bot_token

# Optional: HTTP health server port.
PORT=3000

```

You can use the same RapidAPI key for both services if that key has access
to both APIs. API plans, quotas, and availability are managed by their providers.
For TikTok alone, only `TELEGRAM_API` is required; no TikTok API key is needed.
Keep `.env` private and do not commit it to GitHub.

## TikTok links and fallback

The bot resolves `tt.site` links to ordinary TikTok URLs before calling TikWM.
If TikWM fails or returns no media, it tries the public fxTikTok server at
`tnktok.com`. The fallback downloads an MP4 into memory, up to 50 MiB,
and uploads it to Telegram.

Downloads depend on the external services being available and the media
being accessible. The fallback does not guarantee access to private or
restricted posts.

## Video uploads

Videos from TikWM and Instagram are first sent by URL, without a
local download. If Telegram rejects the URL because the video exceeds its
20 MB URL-fetch limit or Telegram cannot fetch it, the bot downloads it to a
temporary file and uploads it. The wait message is shown only for videos over 20 MB.
Temporary files are deleted after upload or failure. The upload limit is
50 MB; larger videos receive a size-limit message. The fxTikTok fallback
already uploads its downloaded MP4 directly.

If TikWM's version of a TikTok video exceeds 50 MB, the bot also tries fxTikTok
for an alternative version of the same post before reporting the size limit.

When a video exceeds 20 MB, the bot posts a short message asking you to wait.
It removes that notification when the send attempt finishes, including failures.
During file downloads and uploads, it refreshes Telegram's "sending video"
status every four seconds, stopping the refresh when the operation completes
or fails.

## Hosting and tests

On a hosting service, install dependencies, configure the same environment
variables in its settings, and use `npm start` as the start command.
The bot needs outbound HTTPS access to Telegram and the media providers.
The HTTP health endpoint is `/health` on the configured `PORT`.

```sh
# Automated tests: no Telegram connection or .env loading.
npm run test:unit

# Start the live test bot using TELEGRAM_API_TEST.
npm test
```

If you set `PORT`, it applies to both entry points. Use different ports when
running the main and live test bots at the same time.

## Apify Shorts

Set `APIFY_API_TOKEN` in Render. Actor `oIS5Zhu70qEK0t7Lx` receives one Shorts URL with `audioOnly: false`, `ffmpeg: true`, and residential Albania proxy. The bot reads dataset results and sends a media URL. Dataset output field names still require a live run to confirm; if no recognized URL is returned, the logs display field names only. Apify runs may incur costs.
