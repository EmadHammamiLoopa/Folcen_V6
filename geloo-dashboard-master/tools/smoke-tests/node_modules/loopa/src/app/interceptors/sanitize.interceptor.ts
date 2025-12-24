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
      const newBody: any = Array.isArray(body) ? [...body] : { ...body };
      let changed = false;
      for (const k of Object.keys(newBody)) {
        const v = newBody[k];
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
            console.warn('[sanitize] body.' + k + ' is an object and could not be normalized, leaving unchanged');
          }
        }
      }
      if (changed) req = req.clone({ body: newBody });
    }

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
        } catch (e) {}
      }
      if (paramsChanged) req = req.clone({ params });
    }

    return next.handle(req);
  }
}
