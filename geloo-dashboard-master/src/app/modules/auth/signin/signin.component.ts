import { AuthService } from './../../../services/auth.service';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-signin',
  templateUrl: './signin.component.html',
  styleUrls: ['./signin.component.scss']
})
export class SigninComponent implements OnInit {

  loading = false;
  errors: any = null;
  error = '';

  constructor(private authService: AuthService, private router: Router) { }

  ngOnInit(): void {
  }

  submit(data: any): void{
    this.loading = true;
    this.errors = null;
    this.error = '';
    this.authService.signin(data)
    .subscribe(
      (resp: any) => {
        this.loading = false;
        window.localStorage.setItem('token', resp.data.token);
        window.localStorage.setItem('user', JSON.stringify(resp.data.user));
        this.router.navigateByUrl('/dashboard');
      },
      err => {
        this.loading = false;
        // DataService wraps errors as { message, status, detail, url }
        // The original HTTP response body is in err.detail.error
        const raw = err?.detail?.error;
        if (Array.isArray(raw?.errors)) {
          // Validator array: [{ field, message }] → convert to field-key map
          const fieldErrors: Record<string, string[]> = {};
          (raw.errors as any[]).forEach((e: any) => {
            const key = e.field || e.param;
            if (key) {
              if (!fieldErrors[key]) fieldErrors[key] = [];
              fieldErrors[key].push(e.message || e.msg);
            }
          });
          this.errors = fieldErrors;
        } else if (raw?.errors && typeof raw.errors === 'object') {
          // Field-keyed errors object e.g. { email: ['...'], password: ['...'] }
          this.errors = raw.errors;
        } else {
          // String error, generic message, or network failure
          this.error = (typeof raw?.errors === 'string' ? raw.errors : null)
            || raw?.message
            || err?.message
            || 'Sign in failed. Please try again.';
        }
      }
    );
  }

}
