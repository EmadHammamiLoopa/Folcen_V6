'use strict';

/**
 * Build explicit completeness information for a multi-dataset DSAR page.
 *
 * A single page must never be represented as a complete export when previous
 * or later pages exist.
 */
function buildPaginationManifest(
  totals,
  datasets,
  page,
  limit
) {
  const safePage =
    Math.max(
      1,
      Number(page) || 1
    );

  const safeLimit =
    Math.max(
      1,
      Number(limit) || 1
    );

  const skip =
    (safePage - 1) *
    safeLimit;

  const perDataset = {};

  for (
    const [
      name,
      totalValue
    ] of Object.entries(
      totals || {}
    )
  ) {
    const total =
      Math.max(
        0,
        Number(totalValue) || 0
      );

    const rows =
      Array.isArray(
        datasets &&
        datasets[name]
      )
        ? datasets[name]
        : [];

    const returned =
      rows.length;

    const hasMore =
      skip + returned <
      total;

    const nextPage =
      hasMore
        ? safePage + 1
        : null;

    const complete =
      safePage === 1 &&
      !hasMore &&
      returned >= total;

    perDataset[name] = {
      total,
      returned,
      hasMore,
      nextPage,
      complete
    };
  }

  const hasMore =
    Object.values(
      perDataset
    ).some(
      item => item.hasMore
    );

  const complete =
    Object.values(
      perDataset
    ).every(
      item => item.complete
    );

  return {
    page: safePage,
    limit: safeLimit,
    totals: {
      ...(totals || {})
    },
    datasets:
      perDataset,
    hasMore,
    nextPage:
      hasMore
        ? safePage + 1
        : null,
    complete
  };
}


module.exports = {
  buildPaginationManifest
};
