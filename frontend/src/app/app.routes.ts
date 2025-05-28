import { Routes } from '@angular/router';
import { PriceHistoryComponent } from './price-history/price-history.component';
import { UrlListComponent } from './url-list/url-list.component'; // Import UrlListComponent

export const routes: Routes = [
  { path: '', component: UrlListComponent }, // Default route to UrlListComponent
  { path: 'price-history/:encodedUrl', component: PriceHistoryComponent }, // Route with URL parameter
];
