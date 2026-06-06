const activeVideoCalls = Object.create(null);
const activeCallIds = Object.create(null);
const ringTimers = new Map();
const callStates = new Map();
const RING_TIMEOUT_MS = 90_000;
const FINAL_STATES = new Set(['cancelled', 'cancel', 'declined', 'timeout', 'ended', 'failed', 'disconnect']);

function keyOf(from, to) {
  return `${from}:${to}`;
}

function clearRingTimer(from, to) {
  const k1 = keyOf(from, to);
  const k2 = keyOf(to, from);
  const t1 = ringTimers.get(k1);
  const t2 = ringTimers.get(k2);
  if (t1) { clearTimeout(t1); ringTimers.delete(k1); }
  if (t2) { clearTimeout(t2); ringTimers.delete(k2); }
}

function setActivePair(from, to, callId = null) {
  if (!from || !to) return;
  activeVideoCalls[from] = to;
  activeVideoCalls[to] = from;
  if (callId) {
    activeCallIds[keyOf(from, to)] = String(callId);
    activeCallIds[keyOf(to, from)] = String(callId);
  }
}

function getActiveCallId(from, to) {
  return activeCallIds[keyOf(from, to)] || activeCallIds[keyOf(to, from)] || null;
}

function clearActivePair(from, to) {
  if (from) delete activeVideoCalls[from];
  if (to) delete activeVideoCalls[to];
  if (from && to) {
    delete activeCallIds[keyOf(from, to)];
    delete activeCallIds[keyOf(to, from)];
  }
}

function setCallState(callId, state, data = {}) {
  if (!callId) return null;
  const id = String(callId);
  const previous = callStates.get(id) || {};
  const next = {
    ...previous,
    ...data,
    callId: id,
    state,
    status: state,
    updatedAt: Date.now(),
    expiresAt: data.expiresAt || previous.expiresAt || Date.now() + RING_TIMEOUT_MS
  };
  if (next.from && next.to) setActivePair(String(next.from), String(next.to), id);
  if (previous.cleanupTimer) clearTimeout(previous.cleanupTimer);
  const ttl = FINAL_STATES.has(state)
    ? 120_000
    : Math.max(120_000, Number(next.expiresAt || 0) - Date.now() + 120_000);
  next.cleanupTimer = setTimeout(() => callStates.delete(id), ttl);
  callStates.set(id, next);
  return next;
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

function startRingingCall(from, to, callId, data = {}) {
  if (!from || !to || !callId) return null;
  const expiresAt = data.expiresAt || Date.now() + RING_TIMEOUT_MS;
  clearRingTimer(String(from), String(to));
  return setCallState(String(callId), 'ringing', {
    ...data,
    from: String(from),
    to: String(to),
    expiresAt
  });
}

function resetForTests() {
  Object.keys(activeVideoCalls).forEach(k => delete activeVideoCalls[k]);
  Object.keys(activeCallIds).forEach(k => delete activeCallIds[k]);
  for (const timer of ringTimers.values()) clearTimeout(timer);
  ringTimers.clear();
  for (const state of callStates.values()) {
    if (state && state.cleanupTimer) clearTimeout(state.cleanupTimer);
  }
  callStates.clear();
}

module.exports = {
  activeVideoCalls,
  activeCallIds,
  ringTimers,
  callStates,
  RING_TIMEOUT_MS,
  FINAL_STATES,
  keyOf,
  clearRingTimer,
  setActivePair,
  getActiveCallId,
  clearActivePair,
  setCallState,
  getCallState,
  startRingingCall,
  resetForTests
};