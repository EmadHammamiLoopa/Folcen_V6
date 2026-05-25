import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ConsentControlsComponent } from './consent-controls.component';
import { GdprService } from '../../../../services/gdpr.service';
import { NotificationService } from '../../../../services/notification.service';
import { of, throwError } from 'rxjs';

describe('ConsentControlsComponent', () => {
  let component: ConsentControlsComponent;
  let fixture: ComponentFixture<ConsentControlsComponent>;
  let gdprSpy: jasmine.SpyObj<GdprService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;

  const mockConsent = {
    analytics_optin: true,
    personalization: false,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-06-15T12:30:00.000Z',
    history: [
      { key: 'analytics_optin', oldValue: false, newValue: true, changedAt: '2024-06-15T12:30:00.000Z', changedBy: 'admin@folcen.io', source: 'admin_panel' }
    ]
  };

  beforeEach(async () => {
    gdprSpy = jasmine.createSpyObj('GdprService', ['getConsentStatus', 'updateConsent']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['showSuccess', 'showError']);

    await TestBed.configureTestingModule({
      declarations: [ConsentControlsComponent],
      imports: [FormsModule],
      providers: [
        { provide: GdprService, useValue: gdprSpy },
        { provide: NotificationService, useValue: notifySpy },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ConsentControlsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('load()', () => {
    it('populates consent object with createdAt and updatedAt', () => {
      gdprSpy.getConsentStatus.and.returnValue(of({ data: mockConsent }));
      component.userId = 'a'.repeat(24);
      component.load();
      expect(component.consent.createdAt).toBe('2024-01-01T10:00:00.000Z');
      expect(component.consent.updatedAt).toBe('2024-06-15T12:30:00.000Z');
    });

    it('shows error on failure', () => {
      gdprSpy.getConsentStatus.and.returnValue(throwError({ message: 'Not found' }));
      component.userId = 'a'.repeat(24);
      component.load();
      expect(component.error).toBe('Not found');
      expect(notifySpy.showError).toHaveBeenCalled();
    });
  });

  describe('historyItems', () => {
    it('returns reversed history slice', () => {
      component.consent = { ...mockConsent };
      expect(component.historyItems.length).toBe(1);
      expect(component.historyItems[0].key).toBe('analytics_optin');
    });

    it('returns empty array if no history', () => {
      component.consent = { ...mockConsent, history: [] };
      expect(component.historyItems.length).toBe(0);
    });
  });

  describe('lastChange()', () => {
    beforeEach(() => { component.consent = { ...mockConsent }; });

    it('returns a non-empty string for a key with history', () => {
      expect(component.lastChange('analytics_optin')).toContain('admin@folcen.io');
    });

    it('returns empty string for key with no history', () => {
      expect(component.lastChange('personalization')).toBe('');
    });
  });

  describe('toggle()', () => {
    beforeEach(() => {
      component.consent = { ...mockConsent };
      component.userId = 'a'.repeat(24);
    });

    it('inverts the flag value and shows success toast', () => {
      gdprSpy.updateConsent.and.returnValue(of({ data: {} }));
      component.toggle('analytics_optin');   // currently true → should become false
      expect(notifySpy.showSuccess).toHaveBeenCalled();
      expect(component.consent['analytics_optin']).toBeFalse();
    });

    it('shows error toast on failure', () => {
      gdprSpy.updateConsent.and.returnValue(throwError({ message: 'Update failed' }));
      component.toggle('analytics_optin');
      expect(notifySpy.showError).toHaveBeenCalled();
    });
  });
});
