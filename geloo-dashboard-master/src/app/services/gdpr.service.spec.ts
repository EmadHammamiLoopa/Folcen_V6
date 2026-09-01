import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GdprService } from './gdpr.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = 'http://127.0.0.1:3300/api/v1';

describe('GdprService', () => {
  let service: GdprService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [GdprService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(GdprService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('portability URL', () => {
    it('requests portability as query param (not path param)', () => {
      service.exportUserData('user123').subscribe();
      // Should request gdpr/portability?userId=user123, NOT gdpr/portability/user123
      const req = http.expectOne(r =>
        r.url === `${BASE}/gdpr/portability` && r.params.get('userId') === 'user123'
      );
      expect(req.request.method).toBe('GET');
      req.flush({ data: {} });
    });
  });

  describe('in-memory cache', () => {
    it('returns cached consent status on second call within TTL', () => {
      const responses: any[] = [];
      service.getConsentStatus('abc123').subscribe(r => responses.push(r));
      http.expectOne(r => r.url === `${BASE}/gdpr/consent-status`).flush({ data: { analytics_optin: true } });

      service.getConsentStatus('abc123').subscribe(r => responses.push(r));
      // Second call should NOT trigger HTTP request (cache hit)
      http.expectNone(r => r.url === `${BASE}/gdpr/consent-status`);

      expect(responses.length).toBe(2);
      expect((responses[0] as any).data?.analytics_optin).toBe(true);
    });

    it('clears cache when clearCache is called', () => {
      service.getConsentStatus('abc123').subscribe();
      http.expectOne(r => r.url === `${BASE}/gdpr/consent-status`).flush({ data: {} });

      service.clearCache();

      service.getConsentStatus('abc123').subscribe();
      // After clear, a new HTTP request must be made
      http.expectOne(r => r.url === `${BASE}/gdpr/consent-status`).flush({ data: {} });
    });
  });
});
