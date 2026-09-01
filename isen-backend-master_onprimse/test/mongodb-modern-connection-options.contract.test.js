'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('modern MongoDB connection options contract', function () {
  this.timeout(10000);

  const root = path.resolve(__dirname, '..');
  const self = path.resolve(__filename);

  const excludedDirectories =
    new Set([
      'node_modules',
      '.git',
      'coverage',
      'dist',
      'build'
    ]);

  function walk(dir, result = []) {
    for (
      const entry
      of fs.readdirSync(
        dir,
        { withFileTypes: true }
      )
    ) {
      if (
        excludedDirectories.has(entry.name)
      ) {
        continue;
      }

      const full =
        path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full, result);
      } else if (entry.isFile()) {
        result.push(full);
      }
    }

    return result;
  }

  it('does not use deprecated MongoDB parser or topology options', function () {
    const deprecatedNames = [
      ['useNew', 'UrlParser'].join(''),
      ['useUnified', 'Topology'].join('')
    ];

    const hits = [];

    for (const file of walk(root)) {
      if (path.resolve(file) === self) {
        continue;
      }

      let text;

      try {
        text =
          fs.readFileSync(
            file,
            'utf8'
          );
      } catch (_) {
        continue;
      }

      for (const name of deprecatedNames) {
        if (text.includes(name)) {
          hits.push({
            file: path.relative(root, file),
            name
          });
        }
      }
    }

    assert.deepStrictEqual(
      hits,
      []
    );
  });

  it('keeps active server MongoDB configuration environment-driven', function () {
    const index =
      fs.readFileSync(
        path.join(root, 'index.js'),
        'utf8'
      );

    assert.match(
      index,
      /process\.env\.MONGODB_URL/
    );

    assert.doesNotMatch(
      index,
      /mongodb(?:\+srv)?:\/\/[^/\s:@]+:[^/\s@]+@/i
    );
  });
});
