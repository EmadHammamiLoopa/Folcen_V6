import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../../../services/data.service';
import { environment } from '../../../../../environments/environment';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-display-product',
  templateUrl: './display-product.component.html',
  styleUrls: ['./display-product.component.scss']
})
export class DisplayProductComponent implements OnInit {
  productId: string;
  product: any;
  loading = true;
  activeTab = 'details';
  apiUrl = environment.apiUrl.replace(/\/api\/v1\/?$/, ''); // backend root for static files

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dataService: DataService
  ) { }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.productId = params['id'];
      if (this.productId) {
        this.fetchProduct();
      }
    });
  }

  fetchProduct() {
    this.loading = true;
    this.dataService.sendGetRequest(`product/dash/${this.productId}`).subscribe(
      (res: any) => {
        this.product = res.data || res;
        this.loading = false;
      },
      err => {
        console.error('Error fetching product:', err);
        this.loading = false;
        Swal.fire('Error', 'Could not fetch product details', 'error');
      }
    );
  }

  itemId(v: any): string {
    if (!v) return '';
    if (typeof v === 'object' && !Array.isArray(v) && (v._id || v.id)) {
      return this.itemId(v._id || v.id);
    }
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      if (v.$oid) return String(v.$oid);
      if (v.toHexString && typeof v.toHexString === 'function') return v.toHexString();
      const buf = v.buffer || v.data || v;
      if (buf && (typeof buf === 'object' || Array.isArray(buf))) {
        const keys = Object.keys(buf).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
        if (keys.length >= 12) {
          return keys.map(k => Number(buf[k]).toString(16).padStart(2, '0')).join('');
        }
      }
    }
    return String(v) === '[object Object]' ? '' : String(v);
  }

  toggleStatus() {
    this.dataService.sendPostRequest(`product/${this.productId}/status`, {}).subscribe(
      (res: any) => {
        this.product.deletedAt = res.data ? res.data.deletedAt : (this.product.deletedAt ? null : new Date());
        Swal.fire('Success', res.message || 'Status updated', 'success');
      },
      err => Swal.fire('Error', 'Failed to update status', 'error')
    );
  }

  clearReports() {
    Swal.fire({
      title: 'Are you sure?',
      text: 'This will clear all reports for this product',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, clear them'
    }).then((result) => {
      if (result.isConfirmed) {
        this.dataService.sendPostRequest(`product/${this.productId}/clearReports`, {}).subscribe(
          (res: any) => {
            this.product.reports = [];
            Swal.fire('Cleared', 'Reports have been cleared', 'success');
          },
          err => Swal.fire('Error', 'Failed to clear reports', 'error')
        );
      }
    });
  }

  deleteProduct() {
    Swal.fire({
      title: 'Delete Product?',
      text: 'This action cannot be undone!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Delete'
    }).then((result) => {
      if (result.isConfirmed) {
        this.dataService.sendDeleteRequest(`product/dash/${this.productId}`).subscribe(
          () => {
            Swal.fire('Deleted', 'Product has been deleted', 'success');
            this.router.navigate(['/dashboard/Products/list']);
          },
          err => Swal.fire('Error', 'Failed to delete product', 'error')
        );
      }
    });
  }

  buttons: any[] = [
    {
      name: 'Enable',
      icon: 'fas fa-lightbulb',
      color: 'green',
      request: {
        url: 'product/:id/status',
        methode: 'post'
      },
      condition: 'deletedAt'
    },
    {
      name: 'Disable',
      icon: 'far fa-lightbulb',
      color: 'red',
      request: {
        url: 'product/:id/status',
        methode: 'post'
      },
      condition: '!deletedAt'
    },
    {
      name: 'Edit',
      icon: 'fas fa-edit',
      link: '/dashboard/Products/form/edit?id=:id',
      color: 'gray',
    },
    {
      name: 'Delete',
      icon: 'fas fa-trash-alt',
      color: 'red',
      request: {
        url: 'product/dash/:id',
        methode: 'delete',
        redirectURL: '/dashboard/Products/list'
      },
      confirmation: {
        title: 'Delete Product',
        text: 'Are you sure you want to delete this product',
        confirmButtonText: 'Yes',
        confirmButtonColor: 'red',
        showCancelButton: true,
        cancelButtonText: 'No',
        icon: 'warning'
      }
    },
  ];
}
