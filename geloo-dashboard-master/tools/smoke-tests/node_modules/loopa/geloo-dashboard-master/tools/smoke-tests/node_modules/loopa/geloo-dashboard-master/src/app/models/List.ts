import { Header } from './Header';
import { Button } from './Button';
export interface List{
  headers:Header[],
  rows: any[];
  icon: string,
  title: string,
  name: string,
  rowsButtons?: Button[],
  buttons?: Button[]
}
