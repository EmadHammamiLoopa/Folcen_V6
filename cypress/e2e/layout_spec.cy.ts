// Cypress layout & contrast tests
// - Checks key app layout regions don't overlap across multiple viewports
// - Samples visible text nodes to assert contrast ratio >= 4.5:1 in light and dark modes

const viewports: Array<any> = [
  'iphone-6',
  'ipad-2',
  [1366, 768],
  [412, 915]
];

function rgbToLuminance(r: number, g: number, b: number) {
  const srgb = [r, g, b].map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function parseCSSColor(color: string): [number, number, number] {
  if (!color) return [0, 0, 0];
  color = color.trim();
  if (color.startsWith('rgb(')) {
    const parts = color.replace(/rgba?\(/, '').replace(')', '').split(',').map(p => parseFloat(p));
    return [parts[0], parts[1], parts[2]];
  }
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
    }
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  return [0, 0, 0];
}

function contrastRatio(fore: string, back: string) {
  const frgb = parseCSSColor(fore);
  const brgb = parseCSSColor(back);
  const L1 = rgbToLuminance(frgb[0], frgb[1], frgb[2]);
  const L2 = rgbToLuminance(brgb[0], brgb[1], brgb[2]);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Helper to find the nearest non-transparent background color
function findBackgroundColor(el: HTMLElement): string {
  let node: any = el;
  while (node) {
    const style = window.getComputedStyle(node);
    const bg = style.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    node = node.parentElement;
  }
  return 'rgb(255, 255, 255)';
}

context('Layout & Contrast', () => {
  viewports.forEach(vp => {
    const vpName = Array.isArray(vp) ? `${vp[0]}x${vp[1]}` : vp;
    it(`fits layout without overlap and has good contrast on ${vpName}`, () => {
      if (Array.isArray(vp)) cy.viewport(vp[0], vp[1]);
      else cy.viewport(vp as any);

      cy.visit('/');

      // Wait for app basic hydration
      cy.get('ion-app', { timeout: 10000 }).should('exist');

      // Ensure header/content/footer don't overlap
      cy.document().then(doc => {
        const header = doc.querySelector('ion-header');
        const content = doc.querySelector('ion-content');
        const footer = doc.querySelector('ion-footer');

        // If header/content exist, ensure content is below header
        if (header && content) {
          const hRect = header.getBoundingClientRect();
          const cRect = content.getBoundingClientRect();
          expect(cRect.top).to.be.gte(hRect.bottom - 1);
        }

        if (footer && content) {
          const fRect = footer.getBoundingClientRect();
          const cRect = content.getBoundingClientRect();
          expect(cRect.bottom).to.be.lte(fRect.top + 1);
        }

        // Ensure main content fits into viewport
        if (content) {
          const cRect = content.getBoundingClientRect();
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          expect(cRect.left).to.be.at.least(0);
          expect(cRect.top).to.be.at.least(0);
          expect(cRect.right).to.be.at.most(vw + 1);
          expect(cRect.bottom).to.be.at.most(vh + 1);
        }
      });

      // Sample visible text elements and check contrast in light mode
      cy.document().then(doc => {
        const texts = Array.from(doc.querySelectorAll('h1,h2,h3,h4,p,span,a,button'))
          .filter((el: any) => {
            const r = el.getBoundingClientRect();
            return r.width > 10 && r.height > 10 && r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
          });

        // limit samples to 20
        const sample = texts.slice(0, 20);
        sample.forEach(el => {
          const style = window.getComputedStyle(el as Element);
          const color = style.color || 'rgb(0,0,0)';
          const bg = findBackgroundColor(el as HTMLElement);
          const ratio = contrastRatio(color, bg);
          expect(ratio, `contrast ${color} on ${bg}`).to.be.gte(4.5);
        });
      });

      // Toggle dark mode and re-check contrast
      cy.document().then(doc => {
        doc.documentElement.classList.add('dark');
        // small delay for CSS transition
        return new Promise(resolve => setTimeout(resolve, 200));
      }).then(() => {
        cy.document().then(doc => {
          const texts = Array.from(doc.querySelectorAll('h1,h2,h3,h4,p,span,a,button'))
            .filter((el: any) => {
              const r = el.getBoundingClientRect();
              return r.width > 10 && r.height > 10 && r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
            });

          const sample = texts.slice(0, 20);
          sample.forEach(el => {
            const style = window.getComputedStyle(el as Element);
            const color = style.color || 'rgb(255,255,255)';
            const bg = findBackgroundColor(el as HTMLElement);
            const ratio = contrastRatio(color, bg);
            expect(ratio, `dark contrast ${color} on ${bg}`).to.be.gte(4.5);
          });
        });
      });
    });
  });
});
