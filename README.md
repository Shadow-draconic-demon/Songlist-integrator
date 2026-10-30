# WaveQueue

WaveQueue is a static front-end prototype for Twitch song requests delivered to a Discord channel.

## Run locally

Start the app server with:

```bash
npm start
```

Then visit `http://localhost:4173`. The Discord webhook is configured in the local `.env` file and is excluded from git.

Queue entries are shared through the Node server, expire 45 minutes after being requested, and are cleared automatically when the server sees a new calendar day. The queue is held in memory, so restarting the server also starts with an empty queue.

Song durations are looked up from MusicBrainz using the submitted title and artist. Requests without a matching recording length are rejected instead of using an estimate.

## Integration boundary

The interface asks each visitor for a display name and sends requests through `server.js`, which keeps the webhook URL out of browser code. A production deployment should still add:

- Authentication or moderation controls if anonymous display names are not appropriate.
- A server-side Discord bot or webhook endpoint for posting into `#music-requests`.
- Server-side validation, rate limiting, duplicate detection, and queue persistence.