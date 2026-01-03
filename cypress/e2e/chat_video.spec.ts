describe('Chat & Video quick smoke', () => {
  // NOTE: these tests are best-effort; you may need to adjust selectors to match your app.

  it('clicks contact / chat buttons on a product page and measures API response time', () => {
    cy.visit('/');
    // navigate to Buy & Sell -> seller products
    cy.contains(/marketplace|buy|sell/i).click({ force: true });
    cy.wait(500);

    // go to seller products (rely on route)
    cy.visit('/tabs/buy-and-sell/products/sell');

    // intercept posted endpoint and assert response time below 1000ms
    cy.intercept('GET', '/api/v1/product/posted').as('getPosted');

    // wait for posted call and assert timing
    cy.wait('@getPosted').then((interception) => {
      const duration = interception.response?.duration ?? 0;
      cy.log('posted endpoint duration (ms): ' + duration);
      expect(duration).to.be.lessThan(1000);
    });

    // Open first visible product card
    cy.get('[data-cy^=product-card-]').first().click({ force: true });

    // Click Contact Seller if present
    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="contact-seller-btn"]').length) {
        cy.get('[data-cy="contact-seller-btn"]').click({ force: true });
        cy.log('Clicked Contact Seller');
      } else {
        cy.log('Contact Seller button not found');
      }
    });
  });

  it('attempts to start a video call flow by clicking video/call buttons', () => {
    cy.visit('/');
    cy.wait(500);
    // Go to messages tab and open first thread
    cy.contains(/messages/i).click({ force: true });
    cy.wait(500);
    cy.get('app-list, ion-item, .chat-list-item').first().click({ force: true });
    cy.wait(500);

    // Click any Call/Video button if present (best-effort)
    cy.get('body').then(($body) => {
      const callBtn = $body.find('button:contains("Call"), button:contains("Video"), button:contains("Start Call")');
      if (callBtn.length) {
        cy.wrap(callBtn.first()).click({ force: true });
        cy.log('Clicked video/call button');
      } else {
        cy.log('No video/call button found in thread');
      }
    });
  });
});
