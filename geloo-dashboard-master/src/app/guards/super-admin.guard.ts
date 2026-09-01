import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class SuperAdminGuard  {

  constructor(private router: Router){}

  canActivate(): boolean {
    const token = localStorage.getItem('token');
    const rawUser = localStorage.getItem('user');

    if (!token || !rawUser) {
      this.router.navigateByUrl('/auth');
      return false;
    }

    try {
      const user = JSON.parse(rawUser);

      if (
        user &&
        user.role === 'SUPER ADMIN' &&
        user.enabled !== false &&
        user.isDeleted !== true
      ) {
        return true;
      }
    } catch (error) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      this.router.navigateByUrl('/auth');
      return false;
    }

    this.router.navigateByUrl('/dashboard');
    return false;
  }
}
