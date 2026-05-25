import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { AuditLogComponent } from './audit-log.component';
import { GdprService } from '../../../../services/gdpr.service';
import { of, throwError } from 'rxjs';

const mockLogs = [
  { _id: 'log1', action: 'USER_ERASED',   targetUserId: 'u1', actorId: { email: 'admin@folcen.io' }, timestamp: new Date().toISOString(), meta: { reason: 'GDPR request' } },
  { _id: 'log2', action: 'CONSENT_UPDATED', targetUserId: 'u2', actorId: { email: 'admin@folcen.io' }, timestamp: new Date().toISOString(), meta: { key: 'analytics_optin', newValue: false } },
];

describe('AuditLogComponent', () => {
  let component: AuditLogComponent;
  let fixture: ComponentFixture<AuditLogComponent>;
  let gdprSpy: jasmine.SpyObj<GdprService>;

  beforeEach(async () => {
    gdprSpy = jasmine.createSpyObj('GdprService', ['getAuditLogs']);
    gdprSpy.getAuditLogs.and.returnValue(of({ data: { docs: mockLogs, total: 2, totalPages: 1 } }));

    await TestBed.configureTestingModule({
      declarations: [AuditLogComponent],
      imports: [FormsModule],
      providers: [{ provide: GdprService, useValue: gdprSpy }]
    }).compileComponents();

    fixture = TestBed.createComponent(AuditLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => component.ngOnDestroy());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads logs on init without requiring a userId filter', () => {
    expect(gdprSpy.getAuditLogs).toHaveBeenCalledWith(jasmine.objectContaining({ page: 1 }));
    expect(component.logs.length).toBe(2);
  });

  describe('row expansion', () => {
    it('toggleRow expands a row', () => {
      expect(component.isExpanded('log1')).toBeFalse();
      component.toggleRow('log1');
      expect(component.isExpanded('log1')).toBeTrue();
    });

    it('toggleRow collapses an already-expanded row', () => {
      component.toggleRow('log1');
      component.toggleRow('log1');
      expect(component.isExpanded('log1')).toBeFalse();
    });
  });

  describe('rowId()', () => {
    it('returns log._id when available', () => {
      expect(component.rowId(mockLogs[0])).toBe('log1');
    });
  });

  describe('debounced filters', () => {
    it('calls load after userId debounce', fakeAsync(() => {
      gdprSpy.getAuditLogs.calls.reset();
      component.filterUserId = 'u1';
      component.onUserIdInput('u1');
      tick(400);
      expect(gdprSpy.getAuditLogs).toHaveBeenCalledWith(jasmine.objectContaining({ userId: 'u1' }));
    }));

    it('debounces action filter', fakeAsync(() => {
      gdprSpy.getAuditLogs.calls.reset();
      component.filterAction = 'CONSENT';
      component.onActionInput('CONSENT');
      tick(400);
      expect(gdprSpy.getAuditLogs).toHaveBeenCalledWith(jasmine.objectContaining({ action: 'CONSENT' }));
    }));
  });

  describe('pagination', () => {
    it('increments page and reloads on nextPage', () => {
      gdprSpy.getAuditLogs.calls.reset();
      component.totalPages = 3;
      component.page = 1;
      component.nextPage();
      expect(component.page).toBe(2);
      expect(gdprSpy.getAuditLogs).toHaveBeenCalled();
    });

    it('does not go below page 1 on prevPage', () => {
      component.page = 1;
      component.prevPage();
      expect(component.page).toBe(1);
    });
  });

  describe('clearFilters()', () => {
    it('resets both filters and reloads', () => {
      component.filterUserId = 'u1';
      component.filterAction = 'ERASE';
      gdprSpy.getAuditLogs.calls.reset();
      component.clearFilters();
      expect(component.filterUserId).toBe('');
      expect(component.filterAction).toBe('');
      expect(gdprSpy.getAuditLogs).toHaveBeenCalled();
    });
  });

  it('sets error message on failed load', () => {
    gdprSpy.getAuditLogs.and.returnValue(throwError({ message: 'Server error' }));
    component.load();
    expect(component.error).toBe('Server error');
  });
});
