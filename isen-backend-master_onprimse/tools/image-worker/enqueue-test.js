#!/usr/bin/env node
// Usage: node enqueue-test.js <srcPath> <destPath> [timeoutMs]
// Example: node enqueue-test.js test/sample.jpg test/out.jpg 30000

const fs = require('fs');
const path = require('path');

async function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }

async function main(){
  const args = process.argv.slice(2);
  if(args.length < 2){
    console.error('Usage: node enqueue-test.js <srcPath> <destPath> [timeoutMs]');
    process.exit(2);
  }
  const [srcPath, destPath] = args;
  const timeout = parseInt(args[2] || '30000');

  // Ensure source exists
  if(!fs.existsSync(srcPath)){
    console.error('Source file does not exist:', srcPath);
    process.exit(3);
  }

  // Require queue util
  const q = require(path.resolve(__dirname, '..', '..', 'app', 'utils', 'queue'));

  // Ensure Redis is configured for BullMQ path
  const redisHost = process.env.REDIS_HOST || process.env.REDIS_SERVER || null;
  if(!redisHost){
    console.error('REDIS_HOST not set. Set env REDIS_HOST to run Redis-backed test.');
    process.exit(4);
  }

  console.log('Enqueuing job (Redis host):', redisHost);
  const job = await q.enqueueImageProcessing({ srcPath, destPath });
  console.log('Enqueued job:', job);

  // Poll for destPath existence
  const start = Date.now();
  while(Date.now() - start < timeout){
    if(fs.existsSync(destPath)){
      console.log('DEST file created:', destPath);
      process.exit(0);
    }
    await sleep(500);
  }
  console.error('Timed out waiting for dest file.');
  process.exit(1);
}

main().catch(err => {
  console.error('enqueue-test error', err);
  process.exit(1);
});
