import { SweetAlertOptions } from 'sweetalert2';
import { RequestMethode } from './RequestMethode';
export interface Button{
  name: string,
  icon: string,
  color: string,
  request?: {
    url: string,
    methode: RequestMethode,
    redirectURL?: string
  },
  link?: string | ((row: any) => string); 
  confirmation?: SweetAlertOptions<any, any>,
  condition?: string
}
