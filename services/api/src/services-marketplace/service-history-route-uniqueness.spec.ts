import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { ConsumerBookingsController } from './consumer-bookings.controller';
import { ConsumerServiceMemoryController } from './consumer-service-memory.controller';

type ControllerClass = new (...args: never[]) => unknown;

function normalizeRoute(base: string, path: string) {
  return `/${[base, path]
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/')}`;
}

function getRoutes(controller: ControllerClass) {
  const basePath = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
  const prototype = controller.prototype as Record<string, unknown>;

  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .flatMap((name) => {
      const handler = prototype[name];
      if (typeof handler !== 'function') return [];
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (path === undefined || method === undefined) return [];
      return [{ method, path: normalizeRoute(basePath ?? '', path) }];
    });
}

describe('consumer service history route registration', () => {
  it('has exactly one GET /consumer/services/history handler', () => {
    const routes = [
      ...getRoutes(ConsumerBookingsController),
      ...getRoutes(ConsumerServiceMemoryController),
    ];

    const historyRoutes = routes.filter(
      (route) => route.method === RequestMethod.GET && route.path === '/consumer/services/history',
    );

    expect(historyRoutes).toHaveLength(1);
  });
});
