'use strict';

const fs = require('fs');

const resultPath = process.argv[2];
const expectedPassCount = 3;
const expectedFailureCount = 8;

if (!resultPath || !fs.existsSync(resultPath)) {
  console.error('Security audit result file was not created.');
  process.exitCode = 1;
} else {
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const assertionFailuresOnly = result.failed.every(item =>
    item.message.includes('SECURITY_ASSERTION:') &&
    !/before all|before each|after all|after each/i.test(item.title)
  );
  const expected =
    result.tests === expectedPassCount + expectedFailureCount &&
    result.passes === expectedPassCount &&
    result.failures === expectedFailureCount &&
    result.pending === 0 &&
    result.failed.length === expectedFailureCount &&
    assertionFailuresOnly;

  console.log(JSON.stringify({ ...result, expected }, null, 2));
  if (!expected) process.exitCode = 1;
}
