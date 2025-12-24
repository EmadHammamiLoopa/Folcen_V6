import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'extractTime'
})
export class ExtractTimePipe implements PipeTransform {

  transform(value: Date): string {
    return value ? value.toJSON().slice(11, 16) : '';
  }

}
