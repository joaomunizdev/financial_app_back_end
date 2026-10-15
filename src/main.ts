// src/main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { QueryFailedFilter } from './presentation/filters/query-failed.filter';
import { MAIL_ASSETS_DIR } from './infrastructure/mail/code-email';
import { MAIL_ASSETS_ROUTE } from './infrastructure/mail/mail.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false });
  // Behind a hosting proxy, TRUST_PROXY=<hops> makes req.ip (rate limiting) the client's IP.
  const trustProxy = Number(process.env.TRUST_PROXY || 0);
  if (trustProxy > 0) app.set('trust proxy', trustProxy);

  app.setGlobalPrefix('/api');
  app.use(helmet());
  // E-mail images for providers without inline images (Brevo); loaded by mail clients from any origin.
  app.useStaticAssets(MAIL_ASSETS_DIR, {
    prefix: `${MAIL_ASSETS_ROUTE}/`,
    index: false,
    maxAge: '7d',
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
  });

  app.enableCors({
    origin: [process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    exposedHeaders: ['Content-Length'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validateCustomDecorators: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new QueryFailedFilter());

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Financial App API')
      .setDescription('REST API for credit card expense tracking')
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'bearer',
      )
      .build();
    const document = SwaggerModule.createDocument(app, config, {
      deepScanRoutes: true,
    });
    SwaggerModule.setup('/api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(process.env.PORT || 3000, '0.0.0.0');
}
bootstrap();
