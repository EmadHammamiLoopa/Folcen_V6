import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { InterestsComponent } from './interests.component';
import { GdprService } from '../../../../services/gdpr.service';
import { NotificationService } from '../../../../services/notification.service';
import { of, throwError } from 'rxjs';

const mockAggregated = {
  data: {
    consentStats: { optedIn: 40, optedOut: 10, neverResponded: 50, total: 100, optOutRate: '10%' },
    topCategories: [{ _id: 'Technology', count: 200 }, { _id: 'Sports', count: 150 }],
    topChannels: [{ _id: 'ch1', count: 80 }],
    eventBreakdown: [{ _id: 'view', count: 300 }, { _id: 'click', count: 100 }],
    period: { from: '2024-01-01', to: '2024-06-30' }
  }
};

const mockOptedOut = {
  data: { consentStatus: 'opted_out', userId: 'u123' }
};

const mockOptedIn = {
  data: {
    consentStatus: 'opted_in',
    userId: 'u456',
    computedAt: '2024-06-01T00:00:00.000Z',
    topCategories: [{ category: 'Technology', score: 8.5 }],
    evidence: []
  }
};

describe('InterestsComponent', () => {
  let component: InterestsComponent;
  let fixture: ComponentFixture<InterestsComponent>;
  let gdprSpy: jasmine.SpyObj<GdprService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    gdprSpy = jasmine.createSpyObj('GdprService', ['getAggregatedInterests', 'getInterestExplainer', 'clearCache']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['showSuccess', 'showError']);
    gdprSpy.getAggregatedInterests.and.returnValue(of(mockAggregated));

    await TestBed.configureTestingModule({
      declarations: [InterestsComponent],
      imports: [FormsModule],
      providers: [
        { provide: GdprService, useValue: gdprSpy },
        { provide: NotificationService, useValue: notifySpy },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(InterestsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => component.ngOnDestroy());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads aggregated data on init', () => {
    expect(gdprSpy.getAggregatedInterests).toHaveBeenCalled();
    expect(component.stats?.total).toBe(100);
    expect(component.topCategories.length).toBe(2);
    expect(component.eventBreakdown.length).toBe(2);
  });

  it('shows error and calls showError on load failure', () => {
    gdprSpy.getAggregatedInterests.and.returnValue(throwError({ message: 'Analytics unavailable' }));
    component.loadAggregates();
    expect(component.error).toBe('Analytics unavailable');
    expect(notifySpy.showError).toHaveBeenCalled();
  });

  describe('refresh()', () => {
    it('calls clearCache with interests prefix and reloads', () => {
      gdprSpy.getAggregatedInterests.calls.reset();
      component.refresh();
      expect(gdprSpy.clearCache).toHaveBeenCalledWith('interests:');
      expect(gdprSpy.getAggregatedInterests).toHaveBeenCalled();
    });
  });

  describe('totalEvents() / eventPct()', () => {
    it('totalEvents sums all event counts', () => {
      expect(component.totalEvents()).toBe(400);
    });

    it('eventPct calculates percentage correctly', () => {
      expect(component.eventPct(300)).toBe('75.0');
    });

    it('eventPct returns 0 when no events', () => {
      component.eventBreakdown = [];
      expect(component.eventPct(0)).toBe('0');
    });
  });

  describe('consentPct()', () => {
    it('calculates percentage from stats.total', () => {
      expect(component.consentPct(40)).toBe('40');
    });

    it('returns 0 when stats is null', () => {
      component.stats = null;
      expect(component.consentPct(10)).toBe('0');
    });
  });

  describe('per-user explainer', () => {
    it('debounces input for 600ms before calling explainer', fakeAsync(() => {
      gdprSpy.getInterestExplainer = jasmine.createSpy().and.returnValue(of(mockOptedIn));
      component.onExplainInput('a'.repeat(24));
      tick(600);
      expect(gdprSpy.getInterestExplainer).toHaveBeenCalledWith('a'.repeat(24));
    }));

    it('does not call explainer for IDs shorter than 24 chars', fakeAsync(() => {
      gdprSpy.getInterestExplainer = jasmine.createSpy().and.returnValue(of(mockOptedIn));
      component.onExplainInput('short');
      tick(600);
      expect(gdprSpy.getInterestExplainer).not.toHaveBeenCalled();
    }));

    it('sets explainResult when opted-in user is looked up', () => {
      gdprSpy.getInterestExplainer = jasmine.createSpy().and.returnValue(of(mockOptedIn));
      component.runExplainer('u456');
      expect(component.explainResult?.consentStatus).toBe('opted_in');
    });

    it('shows opted-out consent gate when user has opted out', () => {
      gdprSpy.getInterestExplainer = jasmine.createSpy().and.returnValue(of(mockOptedOut));
      component.runExplainer('u123');
      expect(component.explainResult?.consentStatus).toBe('opted_out');
    });

    it('sets explainError on failure', () => {
      gdprSpy.getInterestExplainer = jasmine.createSpy().and.returnValue(throwError({ message: 'Not found' }));
      component.runExplainer('u999');
      expect(component.explainError).toBe('Not found');
    });
  });
});
