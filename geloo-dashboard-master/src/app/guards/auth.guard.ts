import { User } from './../models/User';
import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(private router: Router){}

  canActivate(): boolean {
    if (!window.localStorage.getItem('token')){
      this.router.navigateByUrl('/auth');
      return false;
    }
    const user = new User().initialize(JSON.parse(window.localStorage.getItem('user')))
    if(!user || (user.role != 'ADMIN' && user.role != 'SUPER ADMIN')){
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      this.router.navigateByUrl('/auth');
      return false;
    }
    return true;
  }
}
