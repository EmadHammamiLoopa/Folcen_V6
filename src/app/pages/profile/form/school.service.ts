import { Injectable } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, shareReplay, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

interface University {
  name: string;
  country: string;
  alpha_two_code: string; // e.g., "NO", "US"
}

@Injectable({
  providedIn: 'root'
})
export class SchoolService {
  // Use jsDelivr CDN for CORS-friendly access to the same GitHub file
  private readonly dataUrl =
    'https://cdn.jsdelivr.net/gh/Hipo/university-domains-list@master/world_universities_and_domains.json';

  // Cache the full list (one network call)
  private readonly universities$: Observable<University[]>;
  private readonly rawHttp: HttpClient;

  constructor(private http: HttpClient, private httpBackend: HttpBackend) {
    // create HttpClient that bypasses interceptors (e.g. AuthInterceptor) so
    // the request to the CDN/raw GitHub doesn't include app Authorization header
    this.rawHttp = new HttpClient(this.httpBackend);
    this.universities$ = this.rawHttp.get<University[]>(this.dataUrl).pipe(
      shareReplay(1)
    );
  }

  /**
   * Get university names for a given country.
   * Accepts full country name ("Norway") or ISO alpha-2 code ("NO").
   */
  getUniversityNames(country: string): Observable<string[]> {
    const norm = (country || '').trim().toLowerCase();

    return this.universities$.pipe(
      map(list =>
        list.filter(u =>
          (u.country || '').toLowerCase() === norm ||
          ((u.alpha_two_code || '').toLowerCase() === norm)
        )
      ),
      map(list => Array.from(new Set(list.map(u => u.name))).sort((a, b) => a.localeCompare(b))),
      // If the remote fetch fails (network/CORS/etc) return an empty list
      catchError(err => {
        console.error('SchoolService.getUniversityNames failed:', err);
        // As a fallback, try the GitHub raw URL (some environments allow it)
        try {
          const fallbackUrl = 'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json';
          return this.http.get<any[]>(fallbackUrl).pipe(
            map(list => list.filter(u => u.country && (u.country.toLowerCase() === norm || (u.alpha_two_code || '').toLowerCase() === norm))),
            map(list => Array.from(new Set(list.map(u => u.name))).sort((a, b) => a.localeCompare(b))),
            catchError(innerErr => {
              console.error('Fallback fetch also failed:', innerErr);
              return of([] as string[]);
            })
          );
        } catch (e) {
          return of([] as string[]);
        }
      })
    );
  }

  /**
   * Derive list of countries from the cached universities list.
   * Returns array of objects: { name, code }
   */
  getCountries(): Observable<{ name: string; code: string }[]> {
    return this.universities$.pipe(
      map(list => {
        const mapByCode: Record<string, string> = {};
        for (const u of list) {
          const code = (u.alpha_two_code || '').toUpperCase();
          const name = u.country || '';
          if (!code) continue;
          if (!mapByCode[code]) mapByCode[code] = name;
        }
        const arr = Object.keys(mapByCode).map(code => ({ code, name: mapByCode[code] }));
        // sort by country name
        arr.sort((a, b) => a.name.localeCompare(b.name));
        return arr;
      }),
      catchError(err => {
        console.error('SchoolService.getCountries failed:', err);
        return of([] as { name: string; code: string }[]);
      })
    );
  }
}
