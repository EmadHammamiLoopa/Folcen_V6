import { Component, OnInit, Input, ViewChild } from '@angular/core';
import { User } from './../../../models/User';
import { IonSlides, ModalController } from '@ionic/angular';
import { Router } from '@angular/router';
import { title } from 'process';

@Component({
  selector: 'app-welcome-alert',
  templateUrl: './welcome-alert.component.html',
  styleUrls: ['./welcome-alert.component.scss'],
})
export class WelcomeAlertComponent implements OnInit {

  @ViewChild('slides') slides: IonSlides;

  @Input() user: User;
  currentSlide = 0;
  slideOpts = {
    initialSlide: this.currentSlide,
    speed: 400,
  };
  alerts = [
    {
      image: 'images/svgs/chat.png',
      text: 'Make friends either in your city or around the world, with people who share same interests with you. Chat freely, and enjoy one month free unlimited video chat, with friends.',
      title: 'Creativity'
    },
    {
      image: 'images/svgs/products.png',
      text: 'Post Jobs, services, and sell Products totally free for One month! Enjoy free search for job, services and purchase Products in you city.',
      title: 'Relativity'
    },
    {
      image: 'images/svgs/channels.png',
      text: 'Enjoy Free unlimited Channels creation and follow other channels where you can post, and comment anonymously or with your profile name.',
      title: "Connectivity"
    },
    {
      image: 'images/svgs/subscription.png',
      text: 'Enjoy unlimited access by subscribing.',
      title: 'Flexibility'
    }
  ]

  constructor(private modalCtrl: ModalController, private router: Router) { }

  ngOnInit() {}

  closeModal(){
    this.modalCtrl.dismiss();
  }

  showSubscription(){
    this.closeModal();
    this.router.navigateByUrl('/tabs/subscription')
  }

  nextSlide(){
    if(this.currentSlide == this.alerts.length - 1){
      return this.modalCtrl.dismiss()
    }
    this.slides.slideNext();
  }

  previousSlide(){
    this.slides.slidePrev();
  }

  slideChanged(){
    this.slides.getActiveIndex().then(
      resp => {
        this.currentSlide = resp;
        console.log(resp);
      }
    )
  }
}
