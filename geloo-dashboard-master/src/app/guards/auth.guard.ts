import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard  {

  constructor(private router: Router){}

  canActivate(): boolean {
    const token = window.localStorage.getItem('token');
    const rawUser = window.localStorage.getItem('user');

    if (!token || !rawUser) {
      this.clearSessionAndRedirect();
      return false;
    }

    try {
      const user = JSON.parse(rawUser);

      if (
        !user ||
        (user.role !== 'ADMIN' && user.role !== 'SUPER ADMIN') ||
        user.enabled === false ||
        user.isDeleted === true
      ) {
        this.clearSessionAndRedirect();
        return false;
      }

      return true;
    } catch (error) {
      this.clearSessionAndRedirect();
      return false;
    }
  }

  private clearSessionAndRedirect(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigateByUrl('/auth');
  }
}
