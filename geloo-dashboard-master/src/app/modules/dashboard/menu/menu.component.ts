import { User } from './../../../models/User';
import { AuthService } from './../../../services/auth.service';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-menu',
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss']
})
export class MenuComponent implements OnInit {

  menuItems = [
    {
      name: "users",
      icon: "fas fa-users",
      path: "/dashboard/Users"
    },
    {
      name: "Users Analytics",
      icon: "fas fa-chart-line",
      path: "/dashboard/Users/analytics"
    },
    {
      name: "Channels",
      icon: "fas fa-project-diagram",
      path: "/dashboard/Channels"
    },
    {
      name: "posts",
      icon: "fas fa-clone",
      path: "/dashboard/Posts"
    },
    {
      name: "comments",
      icon: "fas fa-comments",
      path: "/dashboard/Comments"
    },
    {
      name: "products",
      icon: "fas fa-box",
      path: "/dashboard/Products"
    },
    {
      name: "services",
      icon: "fas fa-cogs",
      path: "/dashboard/Services"
    },
    {
      name: "jobs",
      icon: "fas fa-business-time",
      path: "/dashboard/Jobs"
    },
    {
      name: "reports",
      icon: "fas fa-exclamation-triangle",
      path: "/dashboard/reports"
    },
  ];
  user: User;

  constructor(private authService: AuthService, private router: Router) { }

  ngOnInit(): void {
    this.getUser();
    // Ensure both ADMIN and SUPER ADMIN see the subscriptions menu
    const isAdmin = this.user && (this.user.role === 'ADMIN' || this.user.role === 'SUPER ADMIN');
    
    if (isAdmin) {
      this.menuItems.push({
        name: "subscriptions",
        icon: "fas fa-money-check-alt",
        path: "/dashboard/subscriptions"
      });
      this.menuItems.push({
        name: "GDPR Centre",
        icon: "fas fa-shield-alt",
        path: "/dashboard/GDPR"
      });
    }
  }

  signout(){
    this.authService.signout()
    .subscribe(
      resp => {
        window.localStorage.removeItem('token');
        this.router.navigateByUrl('/auth');
      },
      err => {
        // 401 means the token was already revoked — treat as success
        if (err && err.status === 401) {
          window.localStorage.removeItem('token');
          this.router.navigateByUrl('/auth');
          return;
        }
        console.error('Signout failed:', err);
        // Still clear local state so user can re-authenticate
        window.localStorage.removeItem('token');
        this.router.navigateByUrl('/auth');
      }
    )
  }

  getUser(){
    this.user = new User().initialize(JSON.parse(localStorage.getItem('user')));
  }

}
