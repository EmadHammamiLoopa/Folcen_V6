import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { EraseUserComponent } from './erase-user.component';
import { GdprService } from '../../../../services/gdpr.service';
import { NotificationService } from '../../../../services/notification.service';
import { of, throwError } from 'rxjs';

describe('EraseUserComponent', () => {
  let component: EraseUserComponent;
  let fixture: ComponentFixture<EraseUserComponent>;
  let gdprSpy: jasmine.SpyObj<GdprService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    gdprSpy = jasmine.createSpyObj('GdprService', ['erasePreview', 'eraseUser']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['showSuccess', 'showError']);

    await TestBed.configureTestingModule({
      declarations: [EraseUserComponent],
      imports: [FormsModule],
      providers: [
        { provide: GdprService, useValue: gdprSpy },
        { provide: NotificationService, useValue: notifySpy },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EraseUserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('confirmValid', () => {
    it('returns false when confirmText does not match userId', () => {
      component.userId = 'abc123def456abc123def456';
      component.reason = 'Test reason';
      component.confirmText = 'wrongtext';
      expect(component.confirmValid).toBeFalse();
    });

    it('returns false when reason is empty even if confirmText matches', () => {
      component.userId = 'abc123def456abc123def456';
      component.reason = '';
      component.confirmText = 'abc123def456abc123def456';
      expect(component.confirmValid).toBeFalse();
    });

    it('returns true only when confirmText === userId AND reason is provided', () => {
      component.userId = 'abc123def456abc123def456';
      component.reason = 'GDPR ticket #42';
      component.confirmText = 'abc123def456abc123def456';
      expect(component.confirmValid).toBeTrue();
    });
  });

  describe('runPreview', () => {
    it('transitions to confirm step on success', () => {
      gdprSpy.erasePreview.and.returnValue(of({ data: { wouldDelete: { posts: 5 } } }));
      component.userId = 'a'.repeat(24);
      component.runPreview();
      expect(component.step).toBe('confirm');
      expect(component.preview).toBeTruthy();
    });

    it('shows error on failure', () => {
      gdprSpy.erasePreview.and.returnValue(throwError({ message: 'Not found' }));
      component.userId = 'a'.repeat(24);
      component.runPreview();
      expect(component.error).toBe('Not found');
      expect(notifySpy.showError).toHaveBeenCalled();
    });
  });

  describe('confirmErase', () => {
    beforeEach(() => {
      component.userId = 'a'.repeat(24);
      component.reason = 'Test reason';
      component.confirmText = 'a'.repeat(24);
      component.step = 'confirm';
      component.preview = { wouldDelete: { posts: 1 } };
    });

    it('transitions to done on success', () => {
      gdprSpy.eraseUser.and.returnValue(of({ data: { deleted: true } }));
      component.confirmErase();
      expect(component.step).toBe('done');
      expect(notifySpy.showSuccess).toHaveBeenCalled();
    });

    it('shows error toast on failure', () => {
      gdprSpy.eraseUser.and.returnValue(throwError({ message: 'Server error' }));
      component.confirmErase();
      expect(component.error).toBe('Server error');
      expect(notifySpy.showError).toHaveBeenCalled();
    });
  });

  it('reset() returns to input step', () => {
    component.step = 'done';
    component.userId = 'something';
    component.reset();
    expect(component.step).toBe('input');
    expect(component.userId).toBe('');
  });
});
