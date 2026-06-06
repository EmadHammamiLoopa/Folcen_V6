import { Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { GuidedTourService, GuidedTourState, GuidedTourStep } from 'src/app/services/guided-tour.service';

@Component({
  selector: 'app-guided-tour',
  templateUrl: './guided-tour.component.html',
  styleUrls: ['./guided-tour.component.scss']
})
export class GuidedTourComponent implements OnInit, OnDestroy {
  state: GuidedTourState;
  spotlight: DOMRect | null = null;
  private sub: Subscription;
  private resizeHandler = () => this.syncSpotlight();

  constructor(
    public tour: GuidedTourService,
    private zone: NgZone,
    private host: ElementRef<HTMLElement>
  ) {}

  ngOnInit() {
    this.sub = this.tour.state$.subscribe(state => {
      this.state = state;
      if (state.active) {
        setTimeout(() => this.syncSpotlight(), 220);
      } else {
        this.spotlight = null;
      }
    });
    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('orientationchange', this.resizeHandler);
  }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('orientationchange', this.resizeHandler);
  }

  get active(): boolean {
    return !!this.state?.active;
  }

  get step(): GuidedTourStep | null {
    return this.state?.steps?.[this.state.index] || null;
  }

  get progress(): number {
    if (!this.state?.steps?.length) return 0;
    return ((this.state.index + 1) / this.state.steps.length) * 100;
  }

  get spotlightStyle() {
    if (!this.spotlight) return {};
    return {
      width: `${this.spotlight.width + 18}px`,
      height: `${this.spotlight.height + 18}px`,
      transform: `translate3d(${this.spotlight.left - 9}px, ${this.spotlight.top - 9}px, 0)`
    };
  }

  get cardClass() {
    if (!this.spotlight) return 'tour-card centered';
    const cardShouldBeLower = this.spotlight.top < window.innerHeight * 0.5;
    const compact = window.innerHeight < 700 ? ' compact' : '';
    return (cardShouldBeLower ? 'tour-card lower has-spotlight' : 'tour-card upper has-spotlight') + compact;
  }

  next() {
    this.tour.next();
  }

  back() {
    this.tour.back();
  }

  skip() {
    this.tour.skip();
  }

  private syncSpotlight() {
    const step = this.step;
    if (!step?.target) {
      this.zone.run(() => this.spotlight = null);
      return;
    }

    const root = document;
    const target = root.querySelector(step.target) as HTMLElement;
    if (!target || !this.isVisible(target)) {
      this.zone.run(() => this.spotlight = null);
      return;
    }

    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    setTimeout(() => this.updateSpotlightRect(target), 220);
  }

  private updateSpotlightRect(target: HTMLElement) {
    if (!target || !this.isVisible(target)) {
      this.zone.run(() => this.spotlight = null);
      return;
    }
    const rect = target.getBoundingClientRect();
    this.zone.run(() => this.spotlight = rect);
  }

  private isVisible(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }
}
