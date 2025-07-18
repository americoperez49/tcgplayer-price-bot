import { Component, OnInit, OnDestroy } from '@angular/core'; // Import OnDestroy
import { CommonModule } from '@angular/common';
import {
  PriceHistoryService,
  MonitoredUrl,
} from '../../services/price-history.service'; // Updated path
import { Router } from '@angular/router';
import { SocketService } from '../../services/socket.service'; // Import SocketService
import { Subscription } from 'rxjs'; // Import Subscription

@Component({
  selector: 'app-components-url-list', // Updated selector
  standalone: true,
  imports: [CommonModule],
  templateUrl: './url-list.component.html',
  styleUrl: './url-list.component.scss',
})
export class UrlListComponent implements OnInit, OnDestroy {
  urls: MonitoredUrl[] = [];
  errorMessage: string | null = null;
  private priceUpdateSubscription!: Subscription; // Subscription for real-time updates

  constructor(
    private priceHistoryService: PriceHistoryService,
    private router: Router,
    private socketService: SocketService // Inject SocketService
  ) {}

  ngOnInit(): void {
    this.fetchUrls();

    // Subscribe to real-time price updates
    this.priceUpdateSubscription = this.priceHistoryService
      .onPriceUpdate()
      .subscribe((updatedUrl: MonitoredUrl) => {
        // Find the updated URL in the local array and update its properties
        const index = this.urls.findIndex((u) => u.id === updatedUrl.id);
        if (index !== -1) {
          this.urls[index].latestPrice = updatedUrl.latestPrice;
          this.urls[index].hasPriceChanged = updatedUrl.hasPriceChanged;
        }
      });
  }

  ngOnDestroy(): void {
    // Unsubscribe to prevent memory leaks
    if (this.priceUpdateSubscription) {
      this.priceUpdateSubscription.unsubscribe();
    }
  }

  fetchUrls(): void {
    this.priceHistoryService.getAllUrls().subscribe({
      next: (data: MonitoredUrl[]) => {
        // Explicitly type data
        this.urls = data;
        if (this.urls.length === 0) {
          this.errorMessage =
            'No URLs found to monitor. Please add items to the bot.';
        }
      },
      error: (err: any) => {
        // Explicitly type err
        console.error('Error fetching URLs:', err);
        this.errorMessage =
          'Failed to fetch URLs. Please ensure the backend API is running.';
      },
    });
  }

  viewPriceHistory(url: string): void {
    // Encode the URL to safely pass it as a route parameter
    this.router.navigate(['/price-history', encodeURIComponent(url)]);
  }
}
