# LinkedIn kit

Scripts that make CutNest's LinkedIn images, carousel and videos from the real engine and app.
Output goes to `marketing/out/`, which is not committed.

```sh
node marketing/data.js          # real engine layouts -> data.json
node marketing/build.js         # post images, carousel PDF + cover
FFMPEG=/path/to/ffmpeg node marketing/video.js        # 30s overview MP4
FFMPEG=/path/to/ffmpeg node marketing/walkthrough.js  # app screen recording MP4
node marketing/kit.js           # post copy (posts.js) -> linkedin-posts.md + kit.html
```

The videos need an ffmpeg with libx264 (for example `npm i ffmpeg-static`).
