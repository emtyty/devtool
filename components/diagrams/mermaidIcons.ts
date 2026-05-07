// Cloud-provider (and other brand-logo) icon registration for mermaid v11+.
//
// Mermaid v11 introduced architecture diagrams with icon support via
// `mermaid.registerIconPacks()`. We wire up the Iconify `logos` pack
// (MIT-licensed, ~1700 brand icons including AWS, GCP, Azure, Cloudflare,
// Docker, Kubernetes, etc.) and lazy-load it on first use so the bundle
// stays small for users who never reference an icon.
//
// Usage in mermaid syntax (architecture diagram):
//   architecture-beta
//     group cloud(logos:aws)[AWS]
//     service db(logos:aws-rds)[Postgres] in cloud
//     service api(logos:google-cloud)[API] in cloud
//
// Common icon names: logos:aws, logos:aws-rds, logos:aws-s3, logos:aws-lambda,
// logos:google-cloud, logos:google-bigquery, logos:azure, logos:azure-functions,
// logos:cloudflare, logos:docker-icon, logos:kubernetes, logos:redis,
// logos:postgresql, logos:mongodb, logos:nodejs-icon, logos:react.

import mermaid from 'mermaid';
import { addCollection } from '@iconify/react';

let registered = false;
let iconifyLoaded = false;

/**
 * Register the Iconify `logos` pack with both mermaid (for architecture
 * diagrams) and `@iconify/react` (for our native FlowNode icon variant).
 * Idempotent — calling more than once is a no-op.
 *
 * The pack itself is lazy-loaded via dynamic import: nothing is fetched
 * until either mermaid renders an icon-bearing diagram OR a FlowNode
 * referencing `logos:*` is mounted.
 */
export function registerMermaidIcons(): void {
  if (registered) return;
  registered = true;

  // Mermaid path: pack descriptor with a name + loader returning IconifyJSON.
  mermaid.registerIconPacks([
    {
      name: 'logos',
      loader: () => loadLogosPack(),
    },
  ]);

  // @iconify/react path: pre-register so <Icon icon="logos:aws-rds"/> resolves
  // locally without hitting Iconify's CDN. Fire-and-forget — Icon components
  // render reactively once data arrives.
  void loadLogosPack().then((icons) => {
    if (!iconifyLoaded) {
      iconifyLoaded = true;
      addCollection(icons);
    }
  });
}

function loadLogosPack() {
  return import('@iconify-json/logos').then((mod) => mod.icons);
}

/** Subset of cloud-provider icons surfaced as quick-pick suggestions in the UI. */
export interface IconSuggestion {
  /** Mermaid syntax — e.g. `logos:aws-rds` */
  ref: string;
  /** Human label — e.g. "AWS RDS" */
  label: string;
  /** Group for UI grouping — e.g. "AWS" */
  group: string;
}

export const CLOUD_ICON_SUGGESTIONS: readonly IconSuggestion[] = [
  // AWS
  { ref: 'logos:aws', label: 'AWS', group: 'AWS' },
  { ref: 'logos:aws-lambda', label: 'Lambda', group: 'AWS' },
  { ref: 'logos:aws-s3', label: 'S3', group: 'AWS' },
  { ref: 'logos:aws-rds', label: 'RDS', group: 'AWS' },
  { ref: 'logos:aws-dynamodb', label: 'DynamoDB', group: 'AWS' },
  { ref: 'logos:aws-ec2', label: 'EC2', group: 'AWS' },
  { ref: 'logos:aws-api-gateway', label: 'API Gateway', group: 'AWS' },
  { ref: 'logos:aws-cloudfront', label: 'CloudFront', group: 'AWS' },
  { ref: 'logos:aws-sqs', label: 'SQS', group: 'AWS' },
  { ref: 'logos:aws-sns', label: 'SNS', group: 'AWS' },
  // Google Cloud
  { ref: 'logos:google-cloud', label: 'Google Cloud', group: 'GCP' },
  { ref: 'logos:google-cloud-functions', label: 'Cloud Functions', group: 'GCP' },
  { ref: 'logos:google-cloud-storage', label: 'Cloud Storage', group: 'GCP' },
  { ref: 'logos:google-cloud-sql', label: 'Cloud SQL', group: 'GCP' },
  { ref: 'logos:google-bigquery', label: 'BigQuery', group: 'GCP' },
  { ref: 'logos:firebase', label: 'Firebase', group: 'GCP' },
  // Azure
  { ref: 'logos:microsoft-azure', label: 'Azure', group: 'Azure' },
  { ref: 'logos:azure-functions', label: 'Functions', group: 'Azure' },
  { ref: 'logos:azure-cosmos-db', label: 'Cosmos DB', group: 'Azure' },
  // Containers / Infra
  { ref: 'logos:docker-icon', label: 'Docker', group: 'Infra' },
  { ref: 'logos:kubernetes', label: 'Kubernetes', group: 'Infra' },
  { ref: 'logos:nginx', label: 'Nginx', group: 'Infra' },
  { ref: 'logos:cloudflare', label: 'Cloudflare', group: 'Infra' },
  // Datastores
  { ref: 'logos:postgresql', label: 'PostgreSQL', group: 'Data' },
  { ref: 'logos:mongodb-icon', label: 'MongoDB', group: 'Data' },
  { ref: 'logos:redis', label: 'Redis', group: 'Data' },
  { ref: 'logos:elasticsearch', label: 'Elasticsearch', group: 'Data' },
  { ref: 'logos:apache-kafka', label: 'Kafka', group: 'Data' },
  // Languages / Runtimes
  { ref: 'logos:nodejs-icon', label: 'Node.js', group: 'Runtime' },
  { ref: 'logos:python', label: 'Python', group: 'Runtime' },
  { ref: 'logos:go', label: 'Go', group: 'Runtime' },
  { ref: 'logos:react', label: 'React', group: 'Runtime' },
];
