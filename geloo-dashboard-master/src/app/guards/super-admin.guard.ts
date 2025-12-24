import { User } from './../models/User';
import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SuperAdminGuard implements CanActivate {

  constructor(private router: Router){}

  canActivate(): boolean {
    const user = new User().initialize(JSON.parse(localStorage.getItem('user')))
    if(user && user.role == 'SUPER ADMIN') return true;
    this.router.navigateByUrl('/dashboard')
    return false;
  }

}
