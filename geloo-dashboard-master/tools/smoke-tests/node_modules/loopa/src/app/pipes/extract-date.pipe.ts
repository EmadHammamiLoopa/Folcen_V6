import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'extractDate'
})
export class ExtractDatePipe implements PipeTransform {

  transform(value: any, ...args: unknown[]): any {
    if (value && typeof value === 'object' && value.toDate) {
      return value.toDate();
    }
    return value; // Ensure this line does not attempt to call toJSON on value
  }

}
