import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  PriceHistoryService,
  MonitoredUrl,
} from '../../services/price-history.service'; // Updated path
import { Router } from '@angular/router';

@Component({
  selector: 'app-components-url-list', // Updated selector
  standalone: true,
  imports: [CommonModule],
  templateUrl: './url-list.component.html',
  styleUrl: './url-list.component.scss',
})
export class UrlListComponent implements OnInit {
  urls: MonitoredUrl[] = [];
  errorMessage: string | null = null;

  constructor(
    private priceHistoryService: PriceHistoryService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.fetchUrls();
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
