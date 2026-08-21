# Phase 0 security specifications

This directory is intentionally excluded from `npm test`. Its tests assert the
secure behavior that the Phase 0 audit found is not yet enforced. Until the
corresponding production fixes are approved, `npm run test:audit` is expected
to report eleven assertion failures and no setup or hook failures.

The custom reporter records each failure so CI can distinguish a known,
isolated security specification from a broken test environment. A security
specification is converted to a normal passing regression only in the phase
that is authorized to fix that production boundary.
