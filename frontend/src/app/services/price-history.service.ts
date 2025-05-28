import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PriceHistoryEntry {
  id: string;
  urlId: string;
  price: number;
  timestamp: string; // ISO 8601 string
}

export interface MonitoredUrl {
  id: string;
  url: string;
  imageUrl: string | null;
  monitoredItemName: string | null;
  latestPrice: number | null;
  discordUserNames: string[];
}

@Injectable({
  providedIn: 'root',
})
export class PriceHistoryService {
  private baseUrl = 'http://localhost:3001/api'; // Base URL for the API

  constructor(private http: HttpClient) {}

  getPriceHistory(url: string): Observable<PriceHistoryEntry[]> {
    let params = new HttpParams().set('url', url);
    return this.http.get<PriceHistoryEntry[]>(`${this.baseUrl}/price-history`, {
      params,
    });
  }

  getAllUrls(): Observable<MonitoredUrl[]> {
    return this.http.get<MonitoredUrl[]>(`${this.baseUrl}/urls`);
  }
}
