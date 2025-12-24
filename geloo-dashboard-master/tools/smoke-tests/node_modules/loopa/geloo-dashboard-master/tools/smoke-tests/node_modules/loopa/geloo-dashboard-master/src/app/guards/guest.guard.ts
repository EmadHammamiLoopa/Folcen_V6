import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class GuestGuard implements CanActivate {

  constructor(private router: Router){}

  canActivate(): boolean {
    if (window.localStorage.getItem('token')){
      this.router.navigateByUrl('/dashboard');
      return false;
    }
    return true;
  }
}
