# Exercise photos & videos

No image or video URLs are bundled, because inventing links would break the "never fabricate media" rule. Instead:

- Each exercise shows an **equipment illustration**, drawn in code and coloured by muscle group.
- The **"Find demo videos"** button opens a YouTube search for the exercise. It is a search, so check that the technique matches the instructions in the app.
- If a stored image fails to load, it falls back to the illustration automatically. Images are lazy-loaded.

## Adding licensed media
Use media you have the right to use: your own photos and clips, or openly licensed files (e.g. Wikimedia Commons, checking each file's licence). In Supabase → Table Editor → `exercises`, set these on a row:

| Column | Example |
|---|---|
| `image_url` | `https://upload.wikimedia.org/...jpg` (must be https) |
| `image_attribution` | `Photo: Jane Doe, CC BY-SA 4.0` |
| `video_url` | a specific video you've checked |
| `media_source_url` | the page where the licence is stated |

The app shows the attribution text with the exercise. To host your own images, upload them to a **public** Supabase bucket made for this purpose, never the private photo bucket, and paste the public URL.

The landing page uses no stock photography for the same reason. Its visuals are typography, SVG and the plan's real content.
