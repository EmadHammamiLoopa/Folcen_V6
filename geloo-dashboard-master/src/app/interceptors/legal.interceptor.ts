import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, from, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { LegalAcceptanceService } from '../services/legal-acceptance.service';

@Injectable()
export class LegalInterceptor implements HttpInterceptor {
  private isShowingModal = false;

  constructor(private legalService: LegalAcceptanceService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 403 && error.error && error.error.errorCode === 'LEGAL_ACCEPTANCE_REQUIRED') {
          return this.handleLegalAcceptance(req, next, error.error.required);
        }
        return throwError(error);
      })
    );
  }

  private handleLegalAcceptance(req: HttpRequest<any>, next: HttpHandler, requiredDocs: any[]): Observable<HttpEvent<any>> {
    if (this.isShowingModal) {
      // If already showing modal, just wait or fail. 
      // For simplicity, we'll just fail this concurrent request.
      return throwError({ message: 'Legal acceptance in progress' });
    }

    this.isShowingModal = true;

    return from(this.showAcceptanceModal(requiredDocs)).pipe(
      switchMap(accepted => {
        this.isShowingModal = false;
        if (accepted) {
          // Retry the original request
          return next.handle(req);
        } else {
          return throwError({ message: 'Legal documents must be accepted to continue' });
        }
      })
    );
  }

  private async showAcceptanceModal(requiredDocs: any[]): Promise<boolean> {
    const docListHtml = requiredDocs.map(doc => `
      <div style="margin-bottom: 10px; text-align: left;">
        <label>
          <input type="checkbox" class="swal2-checkbox-custom" data-type="${doc.type}" data-version="${doc.version}" checked disabled>
          I accept the <strong>${doc.type.replace(/_/g, ' ').toUpperCase()}</strong> (v${doc.version})
        </label>
      </div>
    `).join('');

    const result = await Swal.fire({
      title: 'Legal Acceptance Required',
      html: `
        <p style="margin-bottom: 20px;">To proceed, you must accept the latest versions of our legal documents:</p>
        ${docListHtml}
        <p style="margin-top: 20px; font-size: 0.8em; color: #666;">By clicking "Accept All", you agree to the documents listed above.</p>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Accept All',
      cancelButtonText: 'Cancel',
      allowOutsideClick: false,
      preConfirm: async () => {
        try {
          // Accept each document
          for (const doc of requiredDocs) {
            await this.legalService.acceptDocument(doc.type, doc.version).toPromise();
          }
          return true;
        } catch (err: any) {
          Swal.showValidationMessage(`Failed to record acceptance: ${err.message || 'Server error'}`);
          return false;
        }
      }
    });

    return !!result.isConfirmed;
  }
}
