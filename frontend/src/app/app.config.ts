import {
  ApplicationConfig,
  inject,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  provideSocketIo,
  Socket,
  SOCKET_CONFIG_TOKEN,
  SocketIoConfig,
} from 'ngx-socket-io'; // Import provideSocketIo and SocketIoConfig

import { routes } from './app.routes';

const config: SocketIoConfig = {
  url: 'https://tcg-player-bot-357901268879.us-south1.run.app',
  options: {},
}; // Define Socket.IO config

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    provideSocketIo(config), // Use provideSocketIo for Socket.IO
    {
      provide: Socket,
      useFactory: () => {
        const config = inject(SOCKET_CONFIG_TOKEN);
        return new Socket(config);
      },
    },
  ],
};
