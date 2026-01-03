Frontend contract: `video-canceled` event
==========================================

Purpose
-------
Servers emit `video-canceled` as the canonical real-time signaling event when a call is cancelled (by caller) or when ringing times out. Frontend clients should rely on `video-canceled` to tear down incoming call UI and decide whether to register a missed call.

Payload
-------
{
  from: string,       // caller id
  to: string,         // callee id
  reason: 'cancel'|'timeout',
  at: number,         // epoch ms
  messageId?: string, // optional message id
  callerName?: string,
  notify: boolean     // true => client should register a missed call (callee); false => cleanup only
}

Developer guidance
------------------
- Listen for `video-canceled` (server-originated) in the video call UI component and call the same handler used for other cancel/timeout events.
- Only add a missed-call entry when `notify === true` and the local user is the callee.
- Ensure ringer audio is stopped on `video-canceled` always.

Example (pseudo)
-----------------
this.socket.on('video-canceled', (p) => {
  this.stopRinger();
  if (p.notify && this.authUser.id === p.to) {
    this.registerMissedCall(p);
  }
  this.closeCallUI();
});
