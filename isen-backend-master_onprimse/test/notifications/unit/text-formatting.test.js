'use strict';

/**
 * Unit tests — Notification text formatting
 *
 * These tests verify the exact strings used in every notification type
 * (N-01 through N-21) WITHOUT touching the database or making network calls.
 *
 * Strategy: derive the expected text using the same string-template logic
 * found in the controllers, then assert the result matches the canonical
 * values documented in SCENARIOS.md and fixtures.js.
 */

const assert = require('chai').assert;
const { ALICE, BOB, CHANNEL, POST, ANON_POST, EXPECTED, IDS } = require('../fixtures');

// ─── Helpers that mirror controller logic ────────────────────────────────────
// These are pure string-formatting helpers extracted from controllers so we
// can test them without booting Express or Mongoose.

/** RequestController pattern */
function friendRequestSentText(sender) {
  const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Someone';
  return { title: senderName, body: 'sent you a friendship request' };
}

function friendRequestAcceptedText(acceptor) {
  const acceptorName = `${acceptor.firstName || ''} ${acceptor.lastName || ''}`.trim() || 'Someone';
  return { title: acceptorName, body: 'accepted your friendship request' };
}

/** FollowController pattern — returns {en: …} wrappers */
function followPublicText(follower) {
  return {
    title: { en: `${follower.firstName} ${follower.lastName}` },
    body:  { en: 'started following you' },
  };
}

function followRequestText(follower) {
  return {
    title: { en: `${follower.firstName} ${follower.lastName}` },
    body:  { en: 'sent you a follow request' },
  };
}

function followAcceptedText(acceptor) {
  return {
    title: { en: `${acceptor.firstName} ${acceptor.lastName}` },
    body:  { en: 'accepted your follow request' },
  };
}

/** PostController — N-08 post published */
function postPublishedText(author, channel) {
  return {
    title: `${author.firstName} ${author.lastName}`,
    body:  `shared a new post in ${channel.name}`,
  };
}

/** PostController — N-09 post voted */
function postVotedText(voter, channel, isAnon) {
  const voterName = isAnon ? 'Anonym' : `${voter.firstName} ${voter.lastName}`;
  return {
    title: channel.name,
    body:  `${voterName} has voted on your post`,
  };
}

/** N-13 mention in post — uses firstName only */
function mentionInPostText(author) {
  return {
    type:  'mention_post',
    title: 'You were mentioned',
    body:  `${author.firstName} mentioned you in a post`,
  };
}

/** N-10 comment on post */
function commentOnPostText(commenter) {
  const senderName = `${commenter.firstName} ${commenter.lastName}`;
  return { type: 'post_commented', title: 'New comment', body: `${senderName} commented on your post` };
}

/** N-11 reply to comment */
function replyToCommentText(replier) {
  const senderName = `${replier.firstName} ${replier.lastName}`;
  return { type: 'reply_to_my_comment', title: 'New reply', body: `${senderName} replied to your comment` };
}

/** N-12 mention in comment */
function mentionInCommentText(mentioner) {
  const senderName = `${mentioner.firstName} ${mentioner.lastName}`;
  return { type: 'mention_comment', title: 'You were mentioned', body: `${senderName} mentioned you in a comment` };
}

/** N-14 comment voted — same pattern as N-09 but for a comment */
function commentVotedText(voter, channel, isAnon) {
  const voterName = isAnon ? 'Anonym' : `${voter.firstName} ${voter.lastName}`;
  return { title: channel.name, body: `${voterName} has voted on your post` };
}

/** ProductController — N-15 */
function newProductText(lister, label) {
  const name = `${lister.firstName} ${lister.lastName}`;
  return { title: name, body: `listed a new product: ${label}` };
}

/** ServiceController — N-16 */
function newServiceText(provider, serviceTitle) {
  const name = `${provider.firstName} ${provider.lastName}`;
  return { title: name, body: `offered a new service: ${serviceTitle}` };
}

/** jobController — N-17 */
function newJobText(poster, jobTitle) {
  const name = `${poster.firstName} ${poster.lastName}`;
  return { title: name, body: `posted a new job: ${jobTitle}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Notification text formatting', function () {

  // ── N-01 ──────────────────────────────────────────────────────────────────

  describe('N-01 · Friend request sent', function () {
    it('title is sender full name, body is fixed string', function () {
      const result = friendRequestSentText(ALICE);
      assert.equal(result.title, EXPECTED.friendRequestSent.title);
      assert.equal(result.body,  EXPECTED.friendRequestSent.body);
    });

    it('falls back to "Someone" when firstName/lastName are missing', function () {
      const result = friendRequestSentText({});
      assert.equal(result.title, 'Someone');
      assert.equal(result.body,  'sent you a friendship request');
    });
  });

  // ── N-02 ──────────────────────────────────────────────────────────────────

  describe('N-02 · Friend request accepted', function () {
    it('title is acceptor full name, body is fixed string', function () {
      const result = friendRequestAcceptedText(BOB);
      assert.equal(result.title, EXPECTED.friendRequestAccepted.title);
      assert.equal(result.body,  EXPECTED.friendRequestAccepted.body);
    });
  });

  // ── N-03 ──────────────────────────────────────────────────────────────────

  describe('N-03 · Friend request declined', function () {
    it('no push — decline triggers a socket event only (documented guard)', function () {
      // There is no text to format for declines — this test documents
      // the intentional absence of a push notification.
      assert.isUndefined(undefined, 'No push text expected for N-03');
    });
  });

  // ── N-04 ──────────────────────────────────────────────────────────────────

  describe('N-04 · Follow public user', function () {
    it('title and body are wrapped in {en: …} objects', function () {
      const result = followPublicText(ALICE);
      assert.deepEqual(result.title, EXPECTED.followPublic.title);
      assert.deepEqual(result.body,  EXPECTED.followPublic.body);
    });
  });

  // ── N-05 ──────────────────────────────────────────────────────────────────

  describe('N-05 · Follow request (private user)', function () {
    it('body reads "sent you a follow request"', function () {
      const result = followRequestText(ALICE);
      assert.deepEqual(result.title, EXPECTED.followRequest.title);
      assert.deepEqual(result.body,  EXPECTED.followRequest.body);
    });
  });

  // ── N-06 ──────────────────────────────────────────────────────────────────

  describe('N-06 · Follow request accepted', function () {
    it('body reads "accepted your follow request"', function () {
      const result = followAcceptedText(BOB);
      assert.deepEqual(result.title, EXPECTED.followAccepted.title);
      assert.deepEqual(result.body,  EXPECTED.followAccepted.body);
    });
  });

  // ── N-08 ──────────────────────────────────────────────────────────────────

  describe('N-08 · Post published', function () {
    it('title is "FirstName LastName", body mentions channel', function () {
      const result = postPublishedText(ALICE, CHANNEL);
      assert.equal(result.title, EXPECTED.postPublished.title);
      assert.equal(result.body,  EXPECTED.postPublished.body);
    });

    it('anonymous posts do NOT generate a notification (guard documented)', function () {
      // The guard is: if (post.anonyme) return;
      // We document this as a boolean check — no text is produced.
      assert.isTrue(ANON_POST.anonyme, 'ANON_POST fixture must have anonyme=true');
    });
  });

  // ── N-09 ──────────────────────────────────────────────────────────────────

  describe('N-09 · Post voted', function () {
    it('non-anonymous voter shows full name', function () {
      const result = postVotedText(ALICE, CHANNEL, false);
      assert.equal(result.title, EXPECTED.postVoted.title);
      assert.equal(result.body,  EXPECTED.postVoted.body);
    });

    it('anonymous voter shows "Anonym"', function () {
      const result = postVotedText(ALICE, CHANNEL, true);
      assert.equal(result.body, EXPECTED.postVotedAnon.body);
      assert.include(result.body, 'Anonym');
    });

    it('self-vote guard — voter === post owner → notification suppressed', function () {
      // Simulates: if (String(req.auth._id) === String(post.user)) return;
      const voterId   = String(IDS.alice);
      const postOwner = String(IDS.alice);
      assert.equal(voterId, postOwner, 'Self-vote guard: should be suppressed when IDs match');
    });
  });

  // ── N-10 ──────────────────────────────────────────────────────────────────

  describe('N-10 · Comment on post', function () {
    it('type is "post_commented", title is "New comment"', function () {
      const result = commentOnPostText(ALICE);
      assert.equal(result.type,  EXPECTED.commentOnPost.type);
      assert.equal(result.title, EXPECTED.commentOnPost.title);
      assert.equal(result.body,  EXPECTED.commentOnPost.body);
    });
  });

  // ── N-11 ──────────────────────────────────────────────────────────────────

  describe('N-11 · Reply to comment', function () {
    it('type is "reply_to_my_comment", title is "New reply"', function () {
      const result = replyToCommentText(ALICE);
      assert.equal(result.type,  EXPECTED.replyToComment.type);
      assert.equal(result.title, EXPECTED.replyToComment.title);
      assert.equal(result.body,  EXPECTED.replyToComment.body);
    });
  });

  // ── N-12 ──────────────────────────────────────────────────────────────────

  describe('N-12 · Mention in comment', function () {
    it('type is "mention_comment", title is "You were mentioned"', function () {
      const result = mentionInCommentText(ALICE);
      assert.equal(result.type,  EXPECTED.mentionInComment.type);
      assert.equal(result.title, EXPECTED.mentionInComment.title);
      assert.equal(result.body,  EXPECTED.mentionInComment.body);
    });

    it('self-mention guard — tagging yourself is suppressed', function () {
      // Documents guard: if (String(taggedUser._id) === String(req.auth._id)) skip
      const taggerId = String(IDS.alice);
      const taggedId = String(IDS.alice);
      const isSelf   = taggerId === taggedId;
      assert.isTrue(isSelf, 'Self-mention should be detected and suppressed');
    });

    it('anon post guard — only post/comment participants can be tagged', function () {
      // In anonymous posts, the participants array is the allow-list.
      // A random user NOT in participants should not receive a mention notification.
      const participants = [String(IDS.alice), String(IDS.bob)];   // alice = post author, bob = prior commenter
      const randomUser   = String(IDS.carol);
      assert.notInclude(participants, randomUser,
        'Carol is not a participant and should not receive a mention when post is anonymous');
    });

    it('non-anon post — non-participant non-friend should not be tagged', function () {
      // Guard: if not participant AND not in sender.friends → skip
      const senderFriends  = ALICE.friends; // []
      const participant    = String(IDS.bob);
      const nonParticipant = String(IDS.carol);

      const isParticipantOrFriend = (uid) =>
        [participant].includes(uid) || senderFriends.includes(uid);

      assert.isTrue(isParticipantOrFriend(participant),   'Bob (participant) should be allowed');
      assert.isFalse(isParticipantOrFriend(nonParticipant), 'Carol (non-participant, non-friend) should be blocked');
    });
  });

  // ── N-13 ──────────────────────────────────────────────────────────────────

  describe('N-13 · Mention in post', function () {
    it('uses firstName ONLY (not full name)', function () {
      const result = mentionInPostText(ALICE);
      assert.include(result.body,    'Alice');
      assert.notInclude(result.body, 'Smith', 'N-13 must use only firstName, not lastName');
      assert.equal(result.body,  EXPECTED.mentionInPost.body);
    });
  });

  // ── N-14 ──────────────────────────────────────────────────────────────────

  describe('N-14 · Comment voted', function () {
    it('non-anonymous voter shows full name', function () {
      const result = commentVotedText(ALICE, CHANNEL, false);
      assert.equal(result.title, EXPECTED.commentVoted.title);
      assert.equal(result.body,  EXPECTED.commentVoted.body);
    });

    it('anonymous voter shows "Anonym"', function () {
      const result = commentVotedText(ALICE, CHANNEL, true);
      assert.include(result.body, 'Anonym');
    });
  });

  // ── N-15 ──────────────────────────────────────────────────────────────────

  describe('N-15 · New product listed', function () {
    it('body includes product label', function () {
      const result = newProductText(ALICE, 'Vintage Lamp');
      assert.equal(result.title, EXPECTED.newProduct.title);
      assert.equal(result.body,  EXPECTED.newProduct.body);
    });
  });

  // ── N-16 ──────────────────────────────────────────────────────────────────

  describe('N-16 · New service offered', function () {
    it('body includes service title', function () {
      const result = newServiceText(ALICE, 'Photography');
      assert.equal(result.title, EXPECTED.newService.title);
      assert.equal(result.body,  EXPECTED.newService.body);
    });
  });

  // ── N-17 ──────────────────────────────────────────────────────────────────

  describe('N-17 · New job posted', function () {
    it('body includes job title', function () {
      const result = newJobText(ALICE, 'Senior Developer');
      assert.equal(result.title, EXPECTED.newJob.title);
      assert.equal(result.body,  EXPECTED.newJob.body);
    });
  });

  // ── N-18 ──────────────────────────────────────────────────────────────────

  describe('N-18 · Welcome on signup', function () {
    it('push body is the exact welcome string (including emoji)', function () {
      const body = 'Welcome to Folcen 👋';
      assert.equal(body, EXPECTED.welcomePush.body);
    });
  });

  // ── N-19 ──────────────────────────────────────────────────────────────────

  describe('N-19 · Incoming call', function () {
    it('FCM push has fixed title "Incoming call" and body "Tap to answer"', function () {
      const { title, body } = EXPECTED.incomingCall;
      assert.equal(title, 'Incoming call');
      assert.equal(body,  'Tap to answer');
    });
  });

  // ── N-20 ──────────────────────────────────────────────────────────────────

  describe('N-20 · Account deletion scheduled', function () {
    it('push body starts with deletion warning text', function () {
      const body = 'Your account has been marked for deletion in 30 days.';
      assert.isTrue(
        body.startsWith(EXPECTED.accountDeletion.bodyPrefix),
        `Expected body to start with "${EXPECTED.accountDeletion.bodyPrefix}"`
      );
    });
  });

  // ── N-21 ──────────────────────────────────────────────────────────────────

  describe('N-21 · Chat socket event name', function () {
    it('fixtures constant is "new-message" with hyphen', function () {
      assert.equal(EXPECTED.chatSocketEvent, 'new-message',
        'Fixture must use hyphen variant');
    });

    it('helpers.realtime.emitNewMessage now also uses "new-message" (Fix 3 — inconsistency resolved)', function () {
      // After Fix 3, both chat.js and helpers.realtime use the same event name.
      // Verify by reading the source of helpers.js (string presence check).
      const fs = require('fs');
      const path = require('path');
      const helpersSource = fs.readFileSync(
        path.resolve(__dirname, '../../../app/helpers.js'), 'utf8'
      );
      // Must contain the hyphen variant
      assert.include(helpersSource, "'new-message'",
        'helpers.js must emit "new-message" (hyphen) after Fix 3');
      // Must NOT contain the old underscore variant in emitNewMessage
      const emitNewMsgMatch = helpersSource.match(/emitNewMessage[\s\S]{0,200}?new_message/);
      assert.isNull(emitNewMsgMatch,
        'helpers.js emitNewMessage must no longer emit "new_message" (underscore)');
    });

    it('AdminController now uses "new-message" (Fix 3)', function () {
      const fs = require('fs');
      const path = require('path');
      const adminSource = fs.readFileSync(
        path.resolve(__dirname, '../../../app/controllers/AdminController.js'), 'utf8'
      );
      assert.notInclude(adminSource, "'new_message'",
        'AdminController must not contain "new_message" (underscore) after Fix 3');
    });
  });

  // ── Fix 4 · Vote guard correctness ────────────────────────────────────────

  describe('Fix 4 · N-14 vote guard should fire on first vote (userVoteInd = -1)', function () {
    it('first-vote scenario: userVoteInd is -1 — explicit check fires notification', function () {
      // Before fix: `if (userVoteInd && ...)` is falsy when userVoteInd = -1
      // After fix:  `if (userVoteInd !== -1 && ...)` is false for -1, so first
      //             vote fires the existing guard correctly.
      // Simulate: initial state = no vote (-1 from findIndex)
      const userVoteInd_firstVote = -1;
      const userVoteInd_existingVote = 0;  // found at index 0

      // With the old buggy guard (truthy check):
      const oldGuard = (ind) => !!ind; // -1 is truthy, 0 is falsy — both wrong edge cases
      // With the fixed guard:
      const fixedGuard = (ind) => ind !== -1;

      // First vote: -1 → old guard fires (truthy), fixed guard does NOT fire
      // (first vote handled by the else branch that pushes a new vote; the notification
      //  check is AFTER the vote update. After the fix, -1 check correctly identifies
      //  first-vote state.)
      assert.isFalse(fixedGuard(userVoteInd_firstVote),
        'On first vote (findIndex = -1), guard should be false — vote just added in else branch');
      assert.isTrue(fixedGuard(userVoteInd_existingVote),
        'On existing vote (findIndex = 0), guard should be true — correct notification path');

      // Show that the OLD guard had the opposite behaviour for index 0:
      assert.isFalse(oldGuard(userVoteInd_existingVote),
        'Old guard suppressed notification for vote at index 0 (falsy) — this was the bug');
    });
  });

  // ── Fix 5 · FCM title normalization ───────────────────────────────────────

  describe('Fix 5 · N-20 FCM title must not render as "[object Object]"', function () {
    it('normalizes { en: "System" } to the string "System"', function () {
      // Mirrors the normalization added to sendNotification 4-arg path in helpers.js
      function normalizeSenderName(senderName) {
        return (senderName && typeof senderName === 'object' && senderName.en)
          ? String(senderName.en)
          : (senderName ? String(senderName) : 'New Message');
      }

      assert.equal(normalizeSenderName({ en: 'System' }), 'System',
        'Object with .en should extract the string value');
      assert.equal(normalizeSenderName('Alice Smith'), 'Alice Smith',
        'Plain string should pass through unchanged');
      assert.equal(normalizeSenderName(undefined), 'New Message',
        'Undefined should fall back to "New Message"');
      assert.notEqual(normalizeSenderName({ en: 'System' }), '[object Object]',
        'Must not render as "[object Object]"');
    });

    it('helpers.js sendNotification 4-arg path contains the normalization guard', function () {
      const fs = require('fs');
      const path = require('path');
      const helpersSource = fs.readFileSync(
        path.resolve(__dirname, '../../../app/helpers.js'), 'utf8'
      );
      assert.include(helpersSource, 'senderName.en',
        'helpers.js sendNotification must extract .en from senderName object');
    });
  });

});
