import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MessengerService {
  private subject = new Subject<any>();

  constructor() { }  

  sendMessage(message: any) {
      this.subject.next(message);
  }

  clearMessages() {
      this.subject.next(null);
  }

  onMessage(): Observable<any> {
      return this.subject.asObservable();
  }
}
