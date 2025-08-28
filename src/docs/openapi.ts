import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import * as path from "path";
import * as YAML from "yaml";

async function generate() {
  const app = await NestFactory.create(AppModule);
  const config = new DocumentBuilder()
    .setTitle("Cards SaaS API")
    .setDescription("REST API for credit card expense tracking")
    .setVersion("1.0.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "bearer"
    )
    .build();
  const doc = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
  });

  const outDir = path.resolve(process.cwd(), "openapi");
  if (!existsSync(outDir)) mkdirSync(outDir);
  writeFileSync(
    path.join(outDir, "swagger.json"),
    JSON.stringify(doc, null, 2),
    "utf-8"
  );
  writeFileSync(
    path.join(outDir, "swagger.yaml"),
    YAML.stringify(doc),
    "utf-8"
  );
  await app.close();
  console.log(
    "OpenAPI written to openapi/swagger.json and openapi/swagger.yaml"
  );
}
generate();
