import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router'; // Import ActivatedRoute
import {
  PriceHistoryService,
  PriceHistoryEntry,
  MonitoredUrl,
  MonitoredUser, // Import MonitoredUser
} from '../../services/price-history.service'; // Updated path
import {
  ChartComponent,
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexDataLabels,
  ApexTooltip,
  ApexStroke,
  ApexTitleSubtitle,
  ApexYAxis,
  NgApexchartsModule,
} from 'ng-apexcharts';
import { Subscription } from 'rxjs'; // Keep Subscription for ngOnDestroy if needed later, but remove priceUpdateSubscription

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  dataLabels: ApexDataLabels;
  tooltip: ApexTooltip;
  stroke: ApexStroke;
  title: ApexTitleSubtitle;
  yaxis: ApexYAxis;
};

@Component({
  selector: 'app-components-price-history', // Updated selector
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  templateUrl: './price-history.component.html',
  styleUrl: './price-history.component.scss',
})
export class PriceHistoryComponent implements OnInit {
  // Removed OnDestroy for now
  @ViewChild('chart') chart!: ChartComponent;
  public chartOptions: Partial<ChartOptions>;

  url: string = ''; // Will be populated from route parameter
  imageUrl: string | null = null; // To store the image URL
  priceHistory: PriceHistoryEntry[] = [];
  monitoredUsers: MonitoredUser[] = []; // To store the list of monitored users with thresholds
  errorMessage: string | null = null;
  private currentUrlId: string | null = null; // To store the ID of the current URL
  isLoading: boolean = true; // Add loading indicator

  constructor(
    private priceHistoryService: PriceHistoryService,
    private route: ActivatedRoute // Inject ActivatedRoute
  ) {
    this.chartOptions = {
      series: [
        {
          name: 'Price',
          data: [],
        },
      ],
      chart: {
        height: 350,
        type: 'line',
        zoom: {
          enabled: true,
        },
      },
      dataLabels: {
        enabled: true,
      },
      stroke: {
        curve: 'stepline',
      },
      title: {
        text: 'Price History',
        align: 'left',
      },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeFormatter: {
            year: 'yyyy',
            month: "MMM 'yy",
            day: 'dd MMM',
            hour: 'hh:mm TT', // Change to 12-hour format with AM/PM
          },
          datetimeUTC: false, // Display datetime in local timezone
        },
        title: {
          text: 'Date',
        },
      },
      yaxis: {
        title: {
          text: 'Price ($)',
        },
        labels: {
          formatter: function (value) {
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(value);
          },
        },
      },
      tooltip: {
        x: {
          format: 'dd MMM yyyy hh:mm TT', // Change to 12-hour format with AM/PM
        },
        y: {
          formatter: function (value) {
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(value);
          },
        },
      },
    };
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const encodedUrl = params.get('encodedUrl');
      if (encodedUrl) {
        this.url = decodeURIComponent(encodedUrl);
        this.fetchMonitoredUrlDetails(); // Fetch URL details including image
        this.fetchPriceHistory();
      } else {
        this.errorMessage = 'No URL provided for price history.';
      }
    });
  }

  fetchMonitoredUrlDetails(): void {
    this.priceHistoryService.getAllUrls().subscribe({
      next: (urls) => {
        const monitoredUrl = urls.find((u) => u.url === this.url);
        if (monitoredUrl) {
          this.imageUrl = monitoredUrl.imageUrl;
          this.monitoredUsers = monitoredUrl.monitoredUsers ?? []; // Directly assign monitoredUsers, default to empty array if null/undefined
          this.currentUrlId = monitoredUrl.id; // Store the URL ID
          // Acknowledge price change when navigating to the item's price history
          if (monitoredUrl.hasPriceChanged && this.currentUrlId) {
            this.acknowledgePriceChange(this.currentUrlId);
          }
        } else {
          this.imageUrl = null; // Clear image if URL not found
          this.monitoredUsers = []; // Clear monitored users if URL not found
        }
      },
      error: (err) => {
        console.error('Error fetching monitored URL details:', err);
        // Optionally set an error message or handle it
      },
    });
  }

  acknowledgePriceChange(urlId: string): void {
    this.priceHistoryService.acknowledgePriceChange(urlId).subscribe({
      next: () => {
        console.log(`Price change acknowledged for URL ID: ${urlId}`);
        // No need to update local monitoredUrls array here, as it's not displayed
      },
      error: (err) => {
        console.error('Error acknowledging price change:', err);
        // Handle error
      },
    });
  }

  fetchPriceHistory(): void {
    this.errorMessage = null; // Clear previous errors
    this.isLoading = true; // Set loading to true when fetching starts
    this.priceHistoryService.getPriceHistory(this.url).subscribe({
      next: (data: PriceHistoryEntry[]) => {
        // Explicitly type data
        this.priceHistory = data;
        if (this.priceHistory.length === 0) {
          this.errorMessage = 'No price history found for this URL.';
        }
        this.updateChart();
        this.isLoading = false; // Set loading to false on success
      },
      error: (err: any) => {
        // Explicitly type err
        console.error('Error fetching price history:', err);
        this.errorMessage =
          err.error?.message ||
          'Failed to fetch price history. Please check the URL and try again.';
        this.priceHistory = [];
        this.updateChart(); // Clear chart on error
        this.isLoading = false; // Set loading to false on error
      },
    });
  }

  private updateChart(): void {
    const chartData = this.priceHistory.map((entry) => ({
      x: new Date(entry.timestamp).getTime(),
      y: entry.price,
    }));

    this.chartOptions.series = [
      {
        name: 'Price',
        data: chartData,
      },
    ];

    if (this.chart) {
      this.chart.updateSeries(this.chartOptions.series);
    }
  }
}
