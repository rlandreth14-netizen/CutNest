#!/usr/bin/env python3
"""Voice-over clips for the YouTube walkthroughs, made offline with Kokoro.

Reads JSON from stdin: {"voice": "bm_george", "speed": 1.0, "lines": [{"file": "...wav", "text": "..."}]}
and writes each line to its wav file, then prints {"file": seconds, ...}.

Needs the kokoro-onnx and soundfile packages, and the model files
kokoro-v1.0.int8.onnx and voices-v1.0.bin in $KOKORO_MODELS (both from
github.com/thewh1teagle/kokoro-onnx/releases, tag model-files-v1.0).
"""
import json, os, sys

import soundfile as sf
from kokoro_onnx import Kokoro

job = json.load(sys.stdin)
models = os.environ.get('KOKORO_MODELS', '.')
k = Kokoro(os.path.join(models, 'kokoro-v1.0.int8.onnx'), os.path.join(models, 'voices-v1.0.bin'))
out = {}
for line in job['lines']:
    if not os.path.exists(line['file']):
        samples, rate = k.create(line['text'], voice=job.get('voice', 'bm_george'), speed=job.get('speed', 1.0), lang='en-gb')
        sf.write(line['file'], samples, rate)
    info = sf.info(line['file'])
    out[line['file']] = info.frames / info.samplerate
print(json.dumps(out))
