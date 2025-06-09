import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject } from 'rxjs'; // Import Subject
import { SocketService } from './socket.service'; // Import SocketService

export interface PriceHistoryEntry {
  id: string;
  urlId: string;
  price: number;
  timestamp: string; // ISO 8601 string
}

export interface MonitoredUser {
  discordUserName: string;
  threshold: number;
}

export interface MonitoredUrl {
  id: string;
  url: string;
  imageUrl: string | null;
  hasPriceChanged: boolean;
  monitoredItemName: string | null;
  latestPrice: number | null;
  lastUpdated: Date | null; // New field for last updated timestamp
  monitoredUsers: MonitoredUser[]; // Keep this for frontend internal use
}

@Injectable({
  providedIn: 'root',
})
export class PriceHistoryService {
  private baseUrl = 'https://tcg-player-bot-357901268879.us-south1.run.app/api'; // Base URL for the API
  private priceUpdateSubject = new Subject<MonitoredUrl>(); // Subject to emit price updates

  constructor(private http: HttpClient, private socketService: SocketService) {
    // Subscribe to real-time price updates from the SocketService
    this.socketService.getPriceUpdates().subscribe((data: MonitoredUrl) => {
      console.log('Received real-time price update:', data);
      this.priceUpdateSubject.next(data); // Emit the update through the subject
    });
  }

  // Observable for components to subscribe to real-time price updates
  onPriceUpdate(): Observable<MonitoredUrl> {
    return this.priceUpdateSubject.asObservable();
  }

  getPriceHistory(url: string): Observable<PriceHistoryEntry[]> {
    let params = new HttpParams().set('url', url);
    return this.http.get<PriceHistoryEntry[]>(`${this.baseUrl}/price-history`, {
      params,
    });
  }

  getAllUrls(): Observable<MonitoredUrl[]> {
    return this.http.get<MonitoredUrl[]>(`${this.baseUrl}/urls`);
  }

  // New method to acknowledge price change
  acknowledgePriceChange(urlId: string): Observable<any> {
    return this.http.put(
      `${this.baseUrl}/urls/${urlId}/acknowledge-price-change`,
      {}
    );
  }
}
