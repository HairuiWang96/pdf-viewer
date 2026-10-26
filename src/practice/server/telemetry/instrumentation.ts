// Copy of the other project's src/server/telemetry/instrumentation.ts. No
// code changes. Nothing here runs it; the typecheck and lint still run
// against it.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';

// don't run telemetry on local development
const enabled = process.env.OTEL_ENABLED === 'true';

if (enabled) {
  const sdk = new NodeSDK({
    traceExporter: new ConsoleSpanExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(),
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
}
