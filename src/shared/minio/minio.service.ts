import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  private bucket: string;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const cfg = this.configService.get('minio');
    this.bucket = cfg.bucket;

    this.client = new Minio.Client({
      endPoint: cfg.endpoint,
      port: cfg.port,
      useSSL: cfg.useSSL,
      accessKey: cfg.accessKey,
      secretKey: cfg.secretKey,
    });

    await this.ensureBucket();
  }

  private async ensureBucket() {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`MinIO bucket "${this.bucket}" created`);
    }
    await this.applyLifecycle();
  }

  private async applyLifecycle() {
    try {
      await this.client.setBucketLifecycle(this.bucket, {
        Rule: [
          {
            ID: 'expire-sourcemaps-180d',
            Status: 'Enabled',
            Filter: { Prefix: '' },
            Expiration: { Days: 180 },
          },
        ],
      });
    } catch (err) {
      this.logger.warn(`MinIO lifecycle 设置失败（不影响启动）: ${err?.message}`);
    }
  }

  async putObject(objectName: string, data: Buffer, contentType = 'application/json') {
    await this.client.putObject(this.bucket, objectName, data, data.length, {
      'Content-Type': contentType,
    });
  }

  async getObject(objectName: string): Promise<Buffer> {
    const stream: Readable = await this.client.getObject(this.bucket, objectName);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async objectExists(objectName: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, objectName);
      return true;
    } catch {
      return false;
    }
  }

  async removeObject(objectName: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectName);
  }
}
