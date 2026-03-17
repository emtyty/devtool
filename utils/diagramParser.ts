export type DiagramOutput = {
  sequence: {
    participants: { id: string; label: string }[];
    steps: { from: string; to: string; label: string }[];
  };
  flowchart: {
    nodes: {
      id: string;
      label: string;
      type: 'user' | 'client' | 'service' | 'database' | 'queue' | 'storage' | 'external';
    }[];
    edges: {
      from: string;
      to: string;
      label?: string;
    }[];
  };
};

const NODE_KEYWORDS: Record<string, DiagramOutput['flowchart']['nodes'][number]['type']> = {
  user: 'user',
  client: 'client',
  mobile: 'client',
  browser: 'client',
  app: 'client',
  frontend: 'client',
  api: 'service',
  server: 'service',
  service: 'service',
  worker: 'service',
  gateway: 'service',
  lambda: 'service',
  function: 'service',
  microservice: 'service',
  postgres: 'database',
  postgresql: 'database',
  mysql: 'database',
  mongo: 'database',
  mongodb: 'database',
  redis: 'database',
  database: 'database',
  db: 'database',
  dynamodb: 'database',
  sqs: 'queue',
  rabbitmq: 'queue',
  kafka: 'queue',
  queue: 'queue',
  pubsub: 'queue',
  sns: 'queue',
  s3: 'storage',
  storage: 'storage',
  bucket: 'storage',
  blob: 'storage',
  cdn: 'external',
  stripe: 'external',
  twilio: 'external',
  email: 'external',
  webhook: 'external',
  external: 'external',
};

function inferNodeType(name: string): DiagramOutput['flowchart']['nodes'][number]['type'] {
  const lower = name.toLowerCase();
  for (const [keyword, type] of Object.entries(NODE_KEYWORDS)) {
    if (lower.includes(keyword)) return type;
  }
  return 'service';
}

function toId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

function parseSentences(input: string): string[] {
  return input
    .split(/[.!?\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function extractEntitiesAndActions(input: string): DiagramOutput {
  const sentences = parseSentences(input);
  const nodesMap = new Map<string, DiagramOutput['flowchart']['nodes'][number]>();
  const steps: DiagramOutput['sequence']['steps'] = [];
  const edges: DiagramOutput['flowchart']['edges'] = [];

  const entityPatterns = [
    /\b(?:from|to|in|into|on|via|through|using)\s+([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)?)/g,
    /\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)?)(?:\s+(?:validates?|stores?|sends?|pushes?|pulls?|processes?|uploads?|downloads?|reads?|writes?|calls?|receives?|forwards?|triggers?|creates?|deletes?|updates?|fetches?|returns?|notifies?|logs?|queues?|publishes?|subscribes?))/g,
    /\b(?:validates?|stores?|sends?|pushes?|pulls?|processes?|uploads?|downloads?|reads?|writes?|calls?|receives?|forwards?|triggers?|creates?|deletes?|updates?|fetches?|returns?|notifies?|logs?|queues?|publishes?|subscribes?)\s+(?:to|in|into|on|from|via)?\s*([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)?)/g,
  ];

  const knownEntities = new Set<string>();

  // First pass: extract known entities
  for (const sentence of sentences) {
    for (const pattern of entityPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(sentence)) !== null) {
        const entity = match[1].trim();
        if (entity.length > 1) knownEntities.add(entity);
      }
    }
  }

  // Also look for known tech names regardless of case
  const techNames = ['SQS', 'S3', 'SNS', 'API', 'CDN', 'Redis', 'Kafka', 'Postgres', 'PostgreSQL', 'MySQL', 'MongoDB', 'DynamoDB', 'RabbitMQ', 'Lambda'];
  for (const sentence of sentences) {
    for (const tech of techNames) {
      if (sentence.toLowerCase().includes(tech.toLowerCase())) {
        knownEntities.add(tech);
      }
    }
  }

  // Ensure node for each entity
  for (const entity of knownEntities) {
    const id = toId(entity);
    if (!nodesMap.has(id)) {
      nodesMap.set(id, { id, label: entity, type: inferNodeType(entity) });
    }
  }

  // If no "User" entity found but text mentions user actions, add one
  const inputLower = input.toLowerCase();
  if (!nodesMap.has('user') && /\buser\b/i.test(input)) {
    nodesMap.set('user', { id: 'user', label: 'User', type: 'user' });
    knownEntities.add('User');
  }

  // Second pass: extract relationships between entities
  const actionVerbs = /(?:validates?|stores?|sends?|pushes?|pulls?|processes?|uploads?|downloads?|reads?|writes?|calls?|receives?|forwards?|triggers?|creates?|deletes?|updates?|fetches?|returns?|notifies?|logs?|queues?|publishes?|subscribes?)/i;

  for (const sentence of sentences) {
    const entitiesInSentence: string[] = [];
    for (const entity of knownEntities) {
      if (sentence.toLowerCase().includes(entity.toLowerCase())) {
        entitiesInSentence.push(entity);
      }
    }

    // Find verbs in sentence for edge labels
    const verbMatch = sentence.match(actionVerbs);
    const action = verbMatch ? verbMatch[0].toLowerCase() : 'connects';

    if (entitiesInSentence.length >= 2) {
      for (let i = 0; i < entitiesInSentence.length - 1; i++) {
        const fromId = toId(entitiesInSentence[i]);
        const toId_ = toId(entitiesInSentence[i + 1]);
        if (fromId !== toId_) {
          const edgeLabel = i === 0 ? action : 'sends';
          steps.push({ from: fromId, to: toId_, label: edgeLabel });
          edges.push({ from: fromId, to: toId_, label: edgeLabel });
        }
      }
    }
  }

  // If we have nodes but no edges, create a linear flow
  if (edges.length === 0 && nodesMap.size > 1) {
    const nodeList = Array.from(nodesMap.values());
    for (let i = 0; i < nodeList.length - 1; i++) {
      steps.push({ from: nodeList[i].id, to: nodeList[i + 1].id, label: 'sends' });
      edges.push({ from: nodeList[i].id, to: nodeList[i + 1].id, label: 'sends' });
    }
  }

  return {
    sequence: {
      participants: Array.from(nodesMap.values()).map(n => ({ id: n.id, label: n.label })),
      steps,
    },
    flowchart: {
      nodes: Array.from(nodesMap.values()),
      edges,
    },
  };
}

export async function generateDiagramJSON(input: string): Promise<DiagramOutput> {
  // Simulate async AI processing
  await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700));

  if (!input.trim()) {
    throw new Error('Please provide a system description.');
  }

  const result = extractEntitiesAndActions(input);

  if (result.flowchart.nodes.length === 0) {
    throw new Error('Could not identify any system components. Try using proper nouns (e.g., "API", "Postgres", "S3") and action verbs (e.g., "sends", "stores", "processes").');
  }

  return result;
}
