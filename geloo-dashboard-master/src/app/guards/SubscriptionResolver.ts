import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { SubscriptionService } from '../modules/dashboard/subscription/subscription.service';  // Import your subscription service

@Injectable({
  providedIn: 'root'
})
export class SubscriptionResolver implements Resolve<any> {

  constructor(private subscriptionService: SubscriptionService) {}

  resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<any> {
    const id = route.paramMap.get('id');
    return this.subscriptionService.getSubscriptionById(id);  // Replace with the actual method to fetch subscription
  }
}
