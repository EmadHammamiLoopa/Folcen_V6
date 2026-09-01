import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class CanActivateGuard  {
  constructor(private router: Router) {}

  canActivate(): boolean {
    const token = window.localStorage.getItem('token');
    if (!token) {
      this.router.navigateByUrl('/auth');
      return false;
    }
    return true;
  }
}
