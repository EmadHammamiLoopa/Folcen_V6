const RING_TIMEOUT_MS = 30 * 1000;

const FINAL_STATES = new Set([
  'cancelled',
  'canceled',
  'declined',
  'rejected',
  'timeout',
  'missed',
  'ended',
  'failed',
  'disconnect'
]);

const callStates = new Map();

function normalizeState(state) {
  if (state === 'cancel' || state === 'canceled') return 'cancelled';
  if (state === 'decline') return 'declined';
  return state || 'unknown';
}

function clearCleanupTimer(entry) {
  if (entry && entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    delete entry.cleanupTimer;
  }
}

function setCallState(callId, state, data = {}) {
  if (!callId) return null;
  const id = String(callId);
  const normalized = normalizeState(state);
  const previous = callStates.get(id) || {};
  clearCleanupTimer(previous);

  const next = {
    ...previous,
    ...data,
    callId: id,
    state: normalized,
    status: normalized,
    updatedAt: Date.now(),
    expiresAt: data.expiresAt || previous.expiresAt || Date.now() + RING_TIMEOUT_MS
  };

  const ttl = FINAL_STATES.has(normalized)
    ? 2 * 60 * 1000
    : Math.max(2 * 60 * 1000, Number(next.expiresAt || Date.now()) - Date.now() + 2 * 60 * 1000);

  next.cleanupTimer = setTimeout(() => callStates.delete(id), ttl);
  callStates.set(id, next);
  console.log('[call-state] set', { callId: id, state: normalized, from: next.from, to: next.to, expiresAt: next.expiresAt });
  return next;
}

function registerRinging({ callId, from, to, expiresAt, source } = {}) {
  if (!callId || !from || !to) return null;
  return setCallState(callId, 'ringing', {
    from: String(from),
    to: String(to),
    expiresAt: expiresAt || Date.now() + RING_TIMEOUT_MS,
    source: source || 'unknown'
  });
}

function getCallState(callId) {
  if (!callId) return null;
  const id = String(callId);
  const state = callStates.get(id);
  if (!state) return null;
  if (!FINAL_STATES.has(state.state) && state.expiresAt && Date.now() > Number(state.expiresAt)) {
    return setCallState(id, 'timeout', { ...state, reason: 'timeout' });
  }
  return state;
}

function isAnswerable(callId) {
  const state = getCallState(callId);
  if (!state) return { answerable: false, status: 'unknown' };
  const answerable = state.state === 'ringing' && (!state.expiresAt || Date.now() <= Number(state.expiresAt));
  return {
    answerable,
    status: state.state,
    state: state.state,
    expiresAt: state.expiresAt,
    reason: state.reason,
    call: state
  };
}

function clearAllForTests() {
  for (const entry of callStates.values()) clearCleanupTimer(entry);
  callStates.clear();
}

module.exports = {
  RING_TIMEOUT_MS,
  FINAL_STATES,
  setCallState,
  registerRinging,
  getCallState,
  isAnswerable,
  clearAllForTests
};
