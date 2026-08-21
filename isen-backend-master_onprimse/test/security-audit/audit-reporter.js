'use strict';

const fs = require('fs');

module.exports = function AuditReporter(runner) {
  const result = {
    tests: 0,
    passes: 0,
    failures: 0,
    pending: 0,
    failed: [],
  };

  runner.on('test end', () => {
    result.tests += 1;
  });
  runner.on('pass', test => {
    result.passes += 1;
    process.stdout.write(`UNEXPECTED PASS ${test.fullTitle()}\n`);
  });
  runner.on('pending', test => {
    result.pending += 1;
    process.stdout.write(`UNEXPECTED PENDING ${test.fullTitle()}\n`);
  });
  runner.on('fail', (runnable, error) => {
    result.failures += 1;
    result.failed.push({
      title: runnable.fullTitle(),
      message: error && error.message ? error.message : String(error),
    });
    process.stdout.write(`EXPECTED SECURITY FAILURE ${runnable.fullTitle()}\n`);
  });
  runner.once('end', () => {
    const output = process.env.AUDIT_RESULT_FILE;
    if (output) fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(
      `Security audit: ${result.passes} passing, ${result.failures} intentionally failing, ` +
      `${result.pending} pending\n`
    );
  });
};
