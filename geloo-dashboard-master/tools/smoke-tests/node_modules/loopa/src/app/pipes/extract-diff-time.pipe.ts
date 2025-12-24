import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'extractDiffTime'
})
export class ExtractDiffTimePipe implements PipeTransform {

  transform(date: Date): string {
    const secs = (new Date().getTime() - date.getTime()) / 1000;
    const mins = secs / 60;
    if(mins > 1){
      const hours = mins / 60;
      if(hours > 1){
        const days = hours / 24;
        if(days > 1){
          const months = days / 30;
          if(months > 1){
            const years = months / 365;
            if(years > 1){
              return Math.floor(months) + "y"
            }
            return Math.floor(months) + "m"
          }
          return Math.floor(days) + "d";
        }
        return Math.floor(hours) + "h"
      }
      return Math.floor(mins) + " min"
    }
    return Math.floor(secs) <= 0 ? 'now' : (Math.floor(secs)  + ' sec')
  }

}
