# LinkedIn kit

Scripts that make CutNest's LinkedIn images, carousel and videos from the real engine and app.
Output goes to `marketing/out/`, which is not committed.

```sh
node marketing/data.js          # real engine layouts -> data.json
node marketing/build.js         # post images, carousel PDF + cover
FFMPEG=/path/to/ffmpeg node marketing/video.js        # 30s overview MP4
FFMPEG=/path/to/ffmpeg node marketing/walkthrough.js  # app screen recording MP4
node marketing/kit.js           # post copy (posts.js) -> linkedin-posts.md + kit.html
FFMPEG=/path/to/ffmpeg node marketing/youtube.js     # YouTube videos with voice-over, subtitles (.srt), thumbnails, channel art
node marketing/srt.js           # rewrite the .srt files from youtube-<id>.json without re-recording
node marketing/youtube-kit.js   # YouTube upload text -> youtube-uploads.md + youtube-kit.html
```

The videos need an ffmpeg with libx264 (for example `npm i ffmpeg-static`).

The YouTube voice-over is made offline by `marketing/tts.py` with Kokoro: `pip install kokoro-onnx soundfile`,
put `kokoro-v1.0.int8.onnx` and `voices-v1.0.bin` (github.com/thewh1teagle/kokoro-onnx releases, tag
`model-files-v1.0`) in a folder named by `KOKORO_MODELS`. `VOICE=bm_lewis` (or `bm_daniel`, `bm_fable`)
changes the voice; `VOICE=none` records silent videos. The narration text is `NARRATION` in `youtube.js`.

Each YouTube render also writes `youtube-<id>.srt`, timed from when each narration line was spoken. The subtitles show
numbers and the web address as written (`WRITTEN` in `srt.js`). The subtitles for the three uploaded videos are kept in
`marketing/subtitles/`, timed against the uploaded files themselves.
