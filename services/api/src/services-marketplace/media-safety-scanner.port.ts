import { ServiceUnavailableException } from '@nestjs/common';

export type MediaSafetyScanResult = {
  status: 'CLEAN' | 'INFECTED';
  engine?: string | null;
  reference?: string | null;
};

export interface MediaSafetyScannerPort {
  scanObject(input: {
    storageKey: string;
    contentType: string;
    contentLengthBytes: number;
  }): Promise<MediaSafetyScanResult>;
}

export const MEDIA_SAFETY_SCANNER = Symbol('MEDIA_SAFETY_SCANNER');

export class UnconfiguredMediaSafetyScanner implements MediaSafetyScannerPort {
  scanObject(): Promise<MediaSafetyScanResult> {
    return Promise.reject(
      new ServiceUnavailableException(
        'Provider media safety scanning is not configured. Configure a malware scanner before enabling uploads.',
      ),
    );
  }
}
