import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';

const serverAppConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
  ],
};

export const serverConfig: ApplicationConfig = mergeApplicationConfig(appConfig, serverAppConfig);
