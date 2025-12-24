import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductService } from 'src/app/services/product.service';
import { Product } from 'src/app/models/Product';
import { ToastService } from 'src/app/services/toast.service';

@Component({
  selector: 'app-edit-product',
  templateUrl: './edit-product.component.html',
  styleUrls: ['./edit-product.component.scss']
})
export class EditProductComponent implements OnInit {
  productId: string;
  product: Product = new Product();
  productImage: File = null; // To handle the new image file

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private productService: ProductService,
    private toastService: ToastService
  ) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.productId = params.get('id');
      if (this.productId) {
        this.getProductDetails(this.productId);
      } else {
        this.toastService.presentStdToastr('Invalid product ID.');
      }
    });
  }

  getProductDetails(productId: string) {
    this.productService.get(productId).then(
      (resp: any) => {
        this.product = new Product().initialize(resp.data);
      },
      err => {
        console.error('Error fetching product details:', err);
        this.toastService.presentStdToastr('Error fetching product details.');
      }
    );
  }

  onFileSelected(event) {
    const files: FileList = event.target.files;
    this.product.photos = Array.from(files).map(file => ({
      path: file.name,
      type: file.type,
    }));
  }
  

  saveProduct() {
    const formData: FormData = new FormData();
    formData.append('label', this.product.label);
    formData.append('description', this.product.description);
    formData.append('price', this.product.price.toString());
    formData.append('currency', this.product.currency);
    formData.append('category', this.product.category);
    if (this.productImage) {
      formData.append('photo', this.productImage, this.productImage.name);
    }

    this.productService.update(this.productId, formData).then(
      (resp: any) => {
        this.toastService.presentStdToastr('Product updated successfully.');
        this.router.navigate(['/product', this.productId]); // Navigate back to the product page
      },
      err => {
        console.error('Error updating product:', err);
        this.toastService.presentStdToastr('Error updating product.');
      }
    );
  }
}
