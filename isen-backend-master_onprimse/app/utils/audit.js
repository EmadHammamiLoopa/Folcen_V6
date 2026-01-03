const AuditLog = require('../models/AuditLog');

function redactDetails(details) {
  if (!details || typeof details !== 'object') return {};
  const out = {};
  for (const k of Object.keys(details)) {
    if (/token|password|pwd|jwt|secret|ssn|national/i.test(k)) continue; // drop sensitive keys
    out[k] = details[k];
  }
  return out;
}

async function recordAudit({ actorId=null, actorRole=null, action, targetUserId=null, details=null, ip=null, userAgent=null }){
  try{
    const meta = redactDetails(details);
    await AuditLog.create({ actorId, actorRole, action, targetUserId, meta, ip, userAgent });
  }catch(e){
    console.error('Audit record failed', e);
  }
}

module.exports = { recordAudit };
