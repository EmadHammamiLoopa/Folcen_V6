import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Pipe({
    name: 'safeUrl',
    standalone: false
})
export class SafeUrlPipe implements PipeTransform {

  constructor(private sanitize: DomSanitizer){

  }

  transform(url: string) {
    return this.sanitize.bypassSecurityTrustResourceUrl(url);
  }

}
