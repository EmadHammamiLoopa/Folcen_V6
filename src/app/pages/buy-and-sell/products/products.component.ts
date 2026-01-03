import { IonInfiniteScroll } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from './../../../services/toast.service';
import { ProductService } from './../../../services/product.service';
import { Product } from './../../../models/Product';
import { Component, OnInit, ViewChild } from '@angular/core';
import constants from 'src/app/helpers/constants';
import { CategoryService } from '../product-form/Categories.service';

@Component({
  selector: 'app-products',
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss'],
})
export class ProductsComponent implements OnInit {
  @ViewChild('infinitScroll') infinitScroll: IonInfiniteScroll;
  filteredProducts: Product[] = []; // Add this line

  pageLoading = false;
  products: Product[] = [];
  allProducts: Product[] = [];
  domain = constants.DOMAIN_URL;
  page: number = 0;
  searchQuery: string = '';
  type: string;
  categories: { name: string, icon: string }[] = [{ name: 'All', icon: 'globe-outline' }];
  selectedCategory: string = 'All';

  slideOpts = {
    slidesPerView: 3.5,  // Show more chips in one view
    spaceBetween: 0,     // No space between slides
    freeMode: true,      // Allow free scrolling
  };
  
  
  constructor(
    private productService: ProductService,
    private categoryService: CategoryService,
    private toastService: ToastService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.fetchCategories();
  
    // Subscribe to route param changes (e.g., 'type')
    this.route.paramMap.subscribe(paramMap => {
      this.type = paramMap.get('type');
      console.log('Type param:', this.type); // Log type param
  
      // Fetch products based on type
      this.initializeProducts();
    });
  
    // Subscribe to query param changes (e.g., 'category')
    this.route.queryParams.subscribe(queryParams => {
      this.selectedCategory = queryParams['category'] || 'All'; // Default to 'All' if no category is provided
      console.log('Selected Category query param:', this.selectedCategory); // Log selected category
  
      // Re-fetch or filter the products based on the new parameters
      this.filterProductsByCategory();
    });
  }
  
  
  
  ionViewWillEnter() {
    console.log('ionViewWillEnter triggered'); // Log when ionViewWillEnter is triggered
    this.pageLoading = true;
    this.searchQuery = "";
    this.page = 0;
    this.getPageType();
    this.initializeProducts();
  }
  
  getProductImage(product: Product): string {
    if (product.photos && product.photos.length > 0) {
      console.log("imageeeeeeeeeee",product.photos[0].url);
      return product.photos[0].url; // Return the URL of the first photo
    } else {
      return 'assets/imgs/no-image.png'; // Placeholder image if no photos exist
    }
  }
  

  showProductForm() {
    this.pageLoading = true;
    this.productService.getStorePermession().then(
      (resp: any) => {
        console.log('Store permission received. Response:', resp);
        if (resp && resp.data && resp.data.date) {
          this.router.navigate(['/tabs/subscription'], {
            queryParams: {
              lastDate: resp.data.date
            }
          });
        } else {
          console.log('Navigating to product form.'); // Log navigation to the product form
          this.router.navigateByUrl('/tabs/buy-and-sell/product/form');
        }
        this.pageLoading = false;
      },
      err => {
        console.log(err);
        this.pageLoading = false;
      }
    );
  }
  

  getPageType() {
    this.route.paramMap.subscribe(param => {
      this.type = param.get('type');
      this.page = 0;
      this.getProducts(null);
    });
  }

  search(val: string) {
    this.searchQuery = val ? val.trim() : ''; // Ensure search query is trimmed and not null
    
    if (this.searchQuery) {
      // Filter products based on the search query
      this.filteredProducts = this.allProducts.filter(product =>
        product.label.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    } else {
      // If no search query, reset the filteredProducts to all products
      this.filteredProducts = this.allProducts;
    }
    
    // Debug log to check filtered products
    console.log('Filtered products:', this.filteredProducts);
  }
  
  

  handleResponse(event, refresh, resp: any) {
    if (!event || refresh) {
      this.products = [];
      this.allProducts = [];
    }

    const list = resp?.data?.products || [];
    list.forEach(prd => {
      try {
        const product = new Product(prd);
        console.log('Product ID:', product.id);
        console.log('Product Photos:', product.photos);
        console.log('Product category:', product.category);
        this.allProducts.push(product);
      } catch (e) { /* skip malformed */ }
    });

    this.filterProductsByCategory();

    if (refresh && this.infinitScroll) this.infinitScroll.disabled = false;

    if (event) {
      event.target.complete();
      if (! (resp?.data?.more) && !refresh) event.target.disabled = true;
    }

    this.pageLoading = false;
    console.log(this.products);
  }

  handleError(err) {
    console.log(err);
    this.pageLoading = false;
    this.toastService.presentErrorToastr(err);
  }

  getProducts(event, refresh?) {
    if (refresh) this.page = 0;
    const query = this.searchQuery || '';
    const category = this.selectedCategory || 'All';  // Default to 'All' if no category is selected
  
    const requestObservable = this.type === 'sell'
      ? this.productService.posted(this.page++, query)
      : this.productService.available(this.page++, query, category);  // Pass category here
  
    requestObservable.then(
      resp => {
        console.log('API response:', resp);  // Debug log API response
        this.handleResponse(event, refresh, resp);
      },
      err => {
        console.error('API Error:', err);  // Log any errors
        this.handleError(err);
      }
    );
  }
  

  fetchCategories() {
    this.categoryService.getCategories().subscribe(
      (data: { name: string, icon: string }[]) => {
        this.categories = [{ name: 'All', icon: 'globe-outline' }, ...data];
        console.log('Fetched categories:', this.categories); // Log fetched categories
      },
      err => {
        console.error('Error fetching categories:', err);
        this.toastService.presentErrorToastr('Error fetching categories.');
      }
    );
  }
  

  initializeProducts() {
    this.products = [];
    this.allProducts = [];
    this.page = 0;
    this.getProducts(null);
  }

  selectCategory(category: { name: string, icon: string }) {
    this.selectedCategory = category.name;
    console.log('Selected category:', this.selectedCategory);
  
    const type = this.type || 'buy'; // Assuming 'buy' as default if this.type is not set
    console.log(`Navigating to: /tabs/buy-and-sell/products/${type}/list with category: ${this.selectedCategory}`); // Log navigation path
  
    // Navigate to a new page for displaying products based on the selected category
    this.router.navigate(['/tabs/buy-and-sell/products', type, 'list'], {
      queryParams: { category: this.selectedCategory }
    }).then(success => {
      console.log('Navigation successful:', success);
    }).catch(error => {
      console.error('Navigation error:', error);
    });
  }
  
  
  
  
  

  filterProductsByCategory() {
    let filteredProducts = this.allProducts || [];

    // For posted products (type === 'sell') we should not restrict by selected category
    // since the posted view is the user's own listings. Only apply category filtering for 'buy' mode.
    if (this.type !== 'sell' && this.selectedCategory && this.selectedCategory !== 'All') {
      const sel = (this.selectedCategory || '').toString().trim().toLowerCase();
      filteredProducts = filteredProducts.filter(product => {
        const cat = (product.category || '').toString().trim().toLowerCase();
        return cat === sel;
      });
    }

    // Further filter by search query (case-insensitive)
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filteredProducts = filteredProducts.filter(product =>
        (product.label || '').toString().toLowerCase().includes(q)
      );
    }

    this.products = filteredProducts;  // Update the products array
    // Keep filteredProducts in sync for search UI
    this.filteredProducts = this.allProducts && this.searchQuery ? filteredProducts : this.allProducts.slice();
    console.log('Filtered products:', this.products, 'allProducts count:', this.allProducts.length);
  }
  
  
  
}
