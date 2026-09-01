import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'resumeText',
    standalone: false
})
export class ResumeTextPipe implements PipeTransform {

  transform(value: string, length: number): string {
    return length ? value.slice(0, length) + (length < value.length ? '...' : '') : value ;
  }

}
