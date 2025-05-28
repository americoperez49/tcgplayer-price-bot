import { Routes } from '@angular/router';
import { PriceHistoryComponent } from './components/price-history/price-history.component'; // Updated path
import { UrlListComponent } from './components/url-list/url-list.component'; // Updated path

export const routes: Routes = [
  { path: '', component: UrlListComponent }, // Default route to UrlListComponent
  { path: 'price-history/:encodedUrl', component: PriceHistoryComponent }, // Route with URL parameter
];
