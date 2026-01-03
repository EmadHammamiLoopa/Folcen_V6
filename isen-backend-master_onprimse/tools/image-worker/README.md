Image worker

This folder contains a minimal BullMQ worker example to offload image processing.

Prereqs:
- Redis running and reachable via REDIS_HOST/REDIS_PORT env vars.

Run the worker:

```bash
cd tools/image-worker
node worker.js
```

Enqueue an image processing job from server code using `app/utils/queue.js`'s `enqueueImageProcessing({ srcPath, destPath })`.
