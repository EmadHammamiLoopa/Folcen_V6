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
        console.log('Error occurred during signin request:', err);

        const error = err.error;
        if (error.errors){
          this.errors = error.errors;
        }else {
          this.error = error;
        }
        this.loading = false;
      }
    );
  }

}
