import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router'; // Import ActivatedRoute
import {
  PriceHistoryService,
  PriceHistoryEntry,
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
  @ViewChild('chart') chart!: ChartComponent;
  public chartOptions: Partial<ChartOptions>;

  url: string = ''; // Will be populated from route parameter
  priceHistory: PriceHistoryEntry[] = [];
  errorMessage: string | null = null;

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
          enabled: false,
        },
      },
      dataLabels: {
        enabled: false,
      },
      stroke: {
        curve: 'straight',
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
            hour: 'HH:mm',
          },
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
          format: 'dd MMM yyyy HH:mm',
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
        this.fetchPriceHistory();
      } else {
        this.errorMessage = 'No URL provided for price history.';
      }
    });
  }

  fetchPriceHistory(): void {
    this.errorMessage = null; // Clear previous errors
    this.priceHistoryService.getPriceHistory(this.url).subscribe({
      next: (data: PriceHistoryEntry[]) => {
        // Explicitly type data
        this.priceHistory = data;
        if (this.priceHistory.length === 0) {
          this.errorMessage = 'No price history found for this URL.';
        }
        this.updateChart();
      },
      error: (err: any) => {
        // Explicitly type err
        console.error('Error fetching price history:', err);
        this.errorMessage =
          err.error?.message ||
          'Failed to fetch price history. Please check the URL and try again.';
        this.priceHistory = [];
        this.updateChart(); // Clear chart on error
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
