import { Injectable } from '@angular/core';
import { Socket } from 'ngx-socket-io';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  constructor(private socket: Socket) {}

  // Listen for 'priceUpdate' events from the server
  getPriceUpdates() {
    return this.socket.fromEvent('priceUpdate').pipe(map((data: any) => data));
  }

  // You can add methods to emit events to the server if needed
  // sendMessage(msg: string) {
  //   this.socket.emit('message', msg);
  // }
}
