import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'extractDiffTime'
})
export class ExtractDiffTimePipe implements PipeTransform {

  transform(date: any): string {
    if (!date) return '';
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const secs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (secs <= 0) return 'now';
    if (secs < 60) return secs + 's';
    const minutes = Math.floor(secs / 60);
    if (minutes < 60) return minutes + 'm';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + 'd';
    const months = Math.floor(days / 30);
    if (months < 12) return months + 'mo';
    const years = Math.floor(months / 12);
    return years + 'y';
  }

}
