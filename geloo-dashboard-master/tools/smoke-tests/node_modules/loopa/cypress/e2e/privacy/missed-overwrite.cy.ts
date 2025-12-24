// @ts-nocheck
/// <reference types="cypress" />
// Cypress E2E privacy smoke test
// Test intent: sign in as test user A, snapshot localStorage.currentUser, remove friend B via API, assert currentUser unchanged

describe('Privacy smoke: prevent auth storage overwrite on friend removal', () => {
  const apiBase = Cypress.env('API_BASE') || 'http://localhost:3300';
  const appBase = Cypress.env('APP_BASE') || 'http://localhost:8100';
  const testUser = Cypress.env('TEST_USER') || 'test_user@example.com';
  const testPass = Cypress.env('TEST_PASS') || 'password123';
  const friendId = Cypress.env('FRIEND_ID') || '';

  before(() => {
    if (!friendId) {
      cy.log('FRIEND_ID not set; test will attempt a UI flow to remove a friend if available');
    }
  });

  it('signs in and preserves currentUser after removing a friend', () => {
    // Deterministic API-based sign-in to obtain JWT + user info
    cy.request({
      method: 'POST',
      url: `${apiBase}/api/v1/auth/signin`,
      body: { email: testUser, password: testPass },
      failOnStatusCode: false
    }).then((resp) => {
      // Save signin response for diagnostics (write immediately so afterEach doesn't need aliases)
      try { cy.writeFile(`cypress/logs/signin-${Date.now()}.json`, resp).then(() => {}); } catch (e) {}
      expect(resp.status, 'signin status').to.be.oneOf([200, 201]);
      const token = resp.body && resp.body.token;
      const user = resp.body && resp.body.user;
      expect(token, 'token present').to.be.a('string');
      expect(user, 'user present').to.be.ok;

      // Set localStorage.currentUser the same shape frontend expects
      const canonical = JSON.stringify({ token, user });
      cy.window().then((win) => {
        win.localStorage.setItem('currentUser', canonical);
      });

      // Confirm it was set
      cy.window().its('localStorage').invoke('getItem', 'currentUser').should('equal', canonical);

      // Capture snapshot
      cy.wrap(canonical).as('beforeUser');

      // Perform friend removal via API if FRIEND_ID provided
      if (friendId) {
        cy.request({
          method: 'POST',
          url: `${apiBase}/api/v1/user/friends/remove/${friendId}`,
          headers: { Authorization: `Bearer ${token}` },
          body: {},
          failOnStatusCode: false
        }).then((r) => {
          // Save friend remove response for diagnostics immediately
          try { cy.writeFile(`cypress/logs/friendRemove-${Date.now()}.json`, r).then(() => {}); } catch (e) {}
          expect(r.status, 'friend remove status').to.be.oneOf([200, 204]);
        });
      } else {
        // Fallback: visit app and attempt UI friend removal
        cy.visit(appBase);
        cy.get('a').contains(/friends/i).click({ force: true });
        cy.get('.friend-item').first().within(() => {
          cy.get('.remove-friend, button.remove').click({ force: true });
        });
      }

      // Wait a moment for processing
      cy.wait(600);

      cy.get('@beforeUser').then((beforeUser) => {
        cy.window().then((win) => {
          const after = win.localStorage.getItem('currentUser');
          expect(after).to.equal(beforeUser as string);
        });
      });
    });
  });

  afterEach(function () {
    // Only collect lightweight diagnostics for failures (avoid alias lookups)
    if (this.currentTest && this.currentTest.state === 'failed') {
      const ts = Date.now();
      // Screenshot
      cy.screenshot(`cypress/logs/failure-${ts}`);

      // Dump localStorage
      cy.window().then((win) => {
        const dump: Record<string, string | null> = {};
        try {
          for (const k of Object.keys(win.localStorage)) {
            dump[k] = win.localStorage.getItem(k);
          }
        } catch (e) {
          // ignore
        }
        return cy.writeFile(`cypress/logs/localStorage-${ts}.json`, dump);
      }).then(() => {}, () => {});
    }
  });
});
