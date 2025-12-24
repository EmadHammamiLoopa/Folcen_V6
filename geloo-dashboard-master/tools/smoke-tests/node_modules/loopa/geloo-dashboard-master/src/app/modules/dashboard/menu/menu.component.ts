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
      path: "/dashboard/Users/"
    },
    {
      name: "Users Analytics",
      icon: "fas fa-chart-line",
      path: "/dashboard/Users/analytics"
    },
    {
      name: "Channels",
      icon: "fas fa-project-diagram",
      path: "/dashboard/Channels/"
    },
    {
      name: "posts",
      icon: "fas fa-clone",
      path: "/dashboard/Posts/"
    },
    {
      name: "comments",
      icon: "fas fa-comments",
      path: "/dashboard/Comments/"
    },
    {
      name: "products",
      icon: "fas fa-box",
      path: "/dashboard/Products/"
    },
    {
      name: "services",
      icon: "fas fa-cogs",
      path: "/dashboard/Services/"
    },
    {
      name: "jobs",
      icon: "fas fa-business-time",
      path: "/dashboard/Jobs/"
    },
    {
      name: "reports",
      icon: "fas fa-exclamation-triangle",
      path: "/dashboard/reports"
    },

    {
      name: "subscriptions",
      icon: "fas fa-exclamation-triangle",
      path: "/dashboard/subscriptions"
    },

  ];
  user: User;

  constructor(private authService: AuthService, private router: Router) { }

  ngOnInit(): void {
    this.getUser();
    if(this.user.role == 'ADMIN'){
      this.menuItems.push(
        {
          name: "subscriptions",
          icon: "fas fa-money-check-alt",
          path: "/dashboard/subscriptions/"
        });
    }
  }

  signout(){
    this.authService.signout()
    .subscribe(
      resp => {
        window.localStorage.removeItem('token');
        this.router.navigateByUrl('/auth')
        console.log();
      },
      err => {

      }
    )
  }

  getUser(){
    this.user = new User().initialize(JSON.parse(localStorage.getItem('user')));
  }

}
