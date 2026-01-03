import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { IdService } from '../services/id.service';

@Injectable()
export class SanitizeInterceptor implements HttpInterceptor {
  constructor(private idService: IdService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    let body = req.body;

    if (body && typeof body === 'object') {
      // shallow sanitize: replace object-shaped ids with base64-encoded strings
      const newBody: any = Array.isArray(body) ? [...body] : { ...body };
      let changed = false;
      for (const k of Object.keys(newBody)) {
        const v = newBody[k];
        // SKIP sanitization for userIds array to prevent double-encoding or corruption
        if (k === 'userIds' && Array.isArray(v)) {
          console.log('[sanitize] skipping userIds array to preserve raw IDs');
          continue;
        }
        if (v && typeof v === 'object') {
          const nid = this.idService.normalizeId(v);
          if (nid) {
            const enc = this.idService.encodeForTransport(nid);
            if (enc) {
              newBody[k] = enc;
              changed = true;
              console.warn('[sanitize] coerced body.' + k + ' -> encoded string');
            }
          } else {
            // If object can't be normalized, log and leave as-is to avoid data loss
            console.warn('[sanitize] body.' + k + ' is an object and could not be normalized, leaving unchanged');
          }
        }
      }
      if (changed) {
        req = req.clone({ body: newBody });
      }
    }

    // shallow sanitize query params (if any)
    if (req.params && req.params.keys().length) {
      let paramsChanged = false;
      let params = req.params;
      for (const key of params.keys()) {
        const val = params.get(key);
        try {
          const parsed = val ? JSON.parse(val) : null;
          if (parsed && typeof parsed === 'object') {
            const nid = this.idService.normalizeId(parsed);
            if (nid) {
              const enc = this.idService.encodeForTransport(nid);
              if (enc) {
                params = params.set(key, enc);
                paramsChanged = true;
                console.warn('[sanitize] coerced param.' + key + ' -> encoded string');
              }
            }
          }
        } catch (e) {
          // not JSON, skip
        }
      }
      if (paramsChanged) req = req.clone({ params });
    }

    return next.handle(req);
  }
}
