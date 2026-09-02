'use strict';

const assert = require('assert');

describe('mongoose index definition contract', function () {
  const Notification =
    require('../app/models/Notification');

  const UserActivityDaily =
    require('../app/models/UserActivityDaily');

  function indexes(model) {
    return model.schema.indexes().map(
      ([spec, options]) => ({
        spec,
        options: options || {}
      })
    );
  }

  function sameSpec(a, b) {
    return JSON.stringify(a)
      === JSON.stringify(b);
  }

  it('keeps only the Notification createdAt TTL single-field index', function () {
    const list =
      indexes(Notification);

    const singleCreatedAt =
      list.filter(({ spec }) =>
        sameSpec(
          spec,
          { createdAt: 1 }
        )
      );

    assert.strictEqual(
      singleCreatedAt.length,
      1
    );

    assert.ok(
      Number(
        singleCreatedAt[0]
          .options
          .expireAfterSeconds
      ) > 0
    );

    assert.notStrictEqual(
      Notification.schema
        .path('createdAt')
        .options
        .index,
      true
    );
  });

  it('preserves Notification query indexes', function () {
    const list =
      indexes(Notification);

    assert.ok(
      list.some(({ spec }) =>
        sameSpec(
          spec,
          {
            recipient: 1,
            createdAt: -1
          }
        )
      )
    );

    assert.ok(
      list.some(({ spec }) =>
        sameSpec(
          spec,
          {
            recipient: 1,
            read: 1
          }
        )
      )
    );
  });

  it('keeps only the UserActivityDaily date TTL single-field index', function () {
    const list =
      indexes(UserActivityDaily);

    const singleDate =
      list.filter(({ spec }) =>
        sameSpec(
          spec,
          { date: 1 }
        )
      );

    assert.strictEqual(
      singleDate.length,
      1
    );

    assert.ok(
      Number(
        singleDate[0]
          .options
          .expireAfterSeconds
      ) > 0
    );

    assert.notStrictEqual(
      UserActivityDaily.schema
        .path('date')
        .options
        .index,
      true
    );
  });

  it('preserves the unique per-user-per-day index', function () {
    const list =
      indexes(UserActivityDaily);

    const uniqueDaily =
      list.find(({ spec }) =>
        sameSpec(
          spec,
          {
            userId: 1,
            date: 1
          }
        )
      );

    assert.ok(
      uniqueDaily
    );

    assert.strictEqual(
      uniqueDaily.options.unique,
      true
    );
  });
});
