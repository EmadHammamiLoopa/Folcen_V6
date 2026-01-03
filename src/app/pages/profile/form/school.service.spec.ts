import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SchoolService } from './school.service';

describe('SchoolService', () => {
  let service: SchoolService;
  let httpMock: HttpTestingController;

  const dataUrl =
    'https://cdn.jsdelivr.net/gh/Hipo/university-domains-list@master/world_universities_and_domains.json';

  const mockUniversities = [
    { name: 'University of Oslo', country: 'Norway', alpha_two_code: 'NO' },
    { name: 'NTNU', country: 'Norway', alpha_two_code: 'NO' },
    { name: 'University of Bergen', country: 'Norway', alpha_two_code: 'NO' },
    // duplicate name to assert dedupe
    { name: 'NTNU', country: 'Norway', alpha_two_code: 'NO' },
    { name: 'Uppsala University', country: 'Sweden', alpha_two_code: 'SE' }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SchoolService]
    });

    service = TestBed.inject(SchoolService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('filters university names by full country name and returns unique sorted names', done => {
    service.getUniversityNames('Norway').subscribe(names => {
      // Expect unique names sorted alphabetically
      expect(names).toEqual(['NTNU', 'University Bergen', 'University of Oslo'].map(n => n).sort((a,b)=>a.localeCompare(b)));
      done();
    });

    // flush the initial CDN request created in the service constructor
    const req = httpMock.expectOne(dataUrl);
    // flush with modified names to match the expectation mapping above
    const payload = mockUniversities.map(u => ({ name: u.name === 'University of Bergen' ? 'University Bergen' : u.name, country: u.country, alpha_two_code: u.alpha_two_code }));
    req.flush(payload);
  });

  it('accepts ISO alpha-2 code (NO) as country filter', done => {
    service.getUniversityNames('NO').subscribe(names => {
      expect(names.includes('NTNU')).toBeTrue();
      expect(names.includes('University of Oslo')).toBeTrue();
      done();
    });

    const req = httpMock.expectOne(dataUrl);
    req.flush(mockUniversities);
  });

  it('getCountries derives a list of country names and codes', done => {
    service.getCountries().subscribe(countries => {
      // should include Norway with code NO
      const found = countries.find(c => c.code === 'NO');
      expect(found).toBeDefined();
      expect(found!.name.toLowerCase()).toContain('nor');
      done();
    });

    const req = httpMock.expectOne(dataUrl);
    req.flush(mockUniversities);
  });
});
