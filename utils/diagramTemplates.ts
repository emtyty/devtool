export type TemplateCategory = 'architecture' | 'data' | 'software' | 'devops';
export type DiagramType = 'flowchart' | 'sequence' | 'c4' | 'er' | 'class' | 'state' | 'gantt' | 'pie' | 'mindmap' | 'timeline' | 'gitgraph' | 'quadrant';

export interface DiagramTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  diagramType: DiagramType;
  mermaidCode: string;
}

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  architecture: 'Architecture',
  data: 'Data Modeling',
  software: 'Software Design',
  devops: 'DevOps',
};

export const DIAGRAM_TYPE_LABELS: Record<DiagramType, string> = {
  flowchart: 'Flowchart',
  sequence: 'Sequence',
  c4: 'C4 Model',
  er: 'ER Diagram',
  class: 'Class Diagram',
  state: 'State Diagram',
  gantt: 'Gantt Chart',
  pie: 'Pie Chart',
  mindmap: 'Mind Map',
  timeline: 'Timeline',
  gitgraph: 'Git Graph',
  quadrant: 'Quadrant Chart',
};

export const TEMPLATES: DiagramTemplate[] = [
  // ── Architecture ──
  {
    id: 'microservices',
    name: 'Microservices',
    category: 'architecture',
    description: 'API gateway, services, databases, and message queue',
    diagramType: 'flowchart',
    mermaidCode: `flowchart LR
    subgraph Clients
        web[/"Web App"\\]
        mobile[/"Mobile App"\\]
    end

    subgraph Gateway
        apigw[API Gateway]
    end

    subgraph Services
        auth[Auth Service]
        user[User Service]
        order[Order Service]
        notify[Notification Service]
    end

    subgraph DataStores
        userdb[(User DB)]
        orderdb[(Order DB)]
        cache[(Redis Cache)]
        queue[[Message Queue]]
    end

    web --> apigw
    mobile --> apigw
    apigw --> auth
    apigw --> user
    apigw --> order
    auth --> cache
    user --> userdb
    order --> orderdb
    order --> queue
    queue --> notify

    style web fill:#8b5cf6,color:#fff,stroke:#8b5cf6
    style mobile fill:#8b5cf6,color:#fff,stroke:#8b5cf6
    style apigw fill:#3b82f6,color:#fff,stroke:#3b82f6
    style auth fill:#10b981,color:#fff,stroke:#10b981
    style user fill:#10b981,color:#fff,stroke:#10b981
    style order fill:#10b981,color:#fff,stroke:#10b981
    style notify fill:#10b981,color:#fff,stroke:#10b981
    style userdb fill:#f59e0b,color:#fff,stroke:#f59e0b
    style orderdb fill:#f59e0b,color:#fff,stroke:#f59e0b
    style cache fill:#f59e0b,color:#fff,stroke:#f59e0b
    style queue fill:#ec4899,color:#fff,stroke:#ec4899`,
  },
  {
    id: 'serverless',
    name: 'Serverless',
    category: 'architecture',
    description: 'AWS Lambda, API Gateway, S3, DynamoDB, SQS',
    diagramType: 'flowchart',
    mermaidCode: `flowchart LR
    subgraph Client
        browser[/"Browser"\\]
    end

    subgraph AWS_Edge["AWS Edge"]
        cf{{CloudFront CDN}}
        apigw[API Gateway]
    end

    subgraph Compute["AWS Lambda"]
        authFn[Auth Function]
        apiFn[API Function]
        workerFn[Worker Function]
    end

    subgraph Storage
        s3[("S3 Bucket")]
        dynamo[(DynamoDB)]
        sqs[[SQS Queue]]
    end

    subgraph External
        ses{{SES Email}}
    end

    browser --> cf
    browser --> apigw
    cf --> s3
    apigw --> authFn
    apigw --> apiFn
    apiFn --> dynamo
    apiFn --> sqs
    sqs --> workerFn
    workerFn --> s3
    workerFn --> ses

    style browser fill:#8b5cf6,color:#fff,stroke:#8b5cf6
    style cf fill:#6b7280,color:#fff,stroke:#6b7280
    style apigw fill:#3b82f6,color:#fff,stroke:#3b82f6
    style authFn fill:#10b981,color:#fff,stroke:#10b981
    style apiFn fill:#10b981,color:#fff,stroke:#10b981
    style workerFn fill:#10b981,color:#fff,stroke:#10b981
    style s3 fill:#06b6d4,color:#fff,stroke:#06b6d4
    style dynamo fill:#f59e0b,color:#fff,stroke:#f59e0b
    style sqs fill:#ec4899,color:#fff,stroke:#ec4899
    style ses fill:#6b7280,color:#fff,stroke:#6b7280`,
  },
  {
    id: 'event-driven',
    name: 'Event-Driven',
    category: 'architecture',
    description: 'Event bus with producers, consumers, and event store',
    diagramType: 'flowchart',
    mermaidCode: `flowchart TB
    subgraph Producers
        orderSvc[Order Service]
        paymentSvc[Payment Service]
        userSvc[User Service]
    end

    subgraph EventBus["Event Bus (Kafka)"]
        topics[[Topic Partitions]]
    end

    subgraph Consumers
        analytics[Analytics Service]
        notify[Notification Service]
        search[Search Indexer]
        audit[Audit Logger]
    end

    subgraph Stores
        eventStore[(Event Store)]
        searchIdx[(Elasticsearch)]
        auditLog[(Audit Log DB)]
    end

    orderSvc -->|OrderCreated| topics
    paymentSvc -->|PaymentProcessed| topics
    userSvc -->|UserRegistered| topics

    topics -->|consume| analytics
    topics -->|consume| notify
    topics -->|consume| search
    topics -->|consume| audit

    topics --> eventStore
    search --> searchIdx
    audit --> auditLog

    style orderSvc fill:#10b981,color:#fff,stroke:#10b981
    style paymentSvc fill:#10b981,color:#fff,stroke:#10b981
    style userSvc fill:#10b981,color:#fff,stroke:#10b981
    style topics fill:#ec4899,color:#fff,stroke:#ec4899
    style analytics fill:#8b5cf6,color:#fff,stroke:#8b5cf6
    style notify fill:#8b5cf6,color:#fff,stroke:#8b5cf6
    style search fill:#8b5cf6,color:#fff,stroke:#8b5cf6
    style audit fill:#8b5cf6,color:#fff,stroke:#8b5cf6
    style eventStore fill:#f59e0b,color:#fff,stroke:#f59e0b
    style searchIdx fill:#f59e0b,color:#fff,stroke:#f59e0b
    style auditLog fill:#f59e0b,color:#fff,stroke:#f59e0b`,
  },
  {
    id: 'cqrs',
    name: 'CQRS + Event Sourcing',
    category: 'architecture',
    description: 'Command/Query separation with event store and projections',
    diagramType: 'flowchart',
    mermaidCode: `flowchart LR
    subgraph Client
        ui[/"UI Client"\\]
    end

    subgraph Commands["Command Side"]
        cmdApi[Command API]
        cmdHandler[Command Handler]
        aggregate[Aggregate Root]
    end

    subgraph Events["Event Infrastructure"]
        eventBus[[Event Bus]]
        eventStore[(Event Store)]
    end

    subgraph Queries["Query Side"]
        projector[Projector]
        readDb[(Read Database)]
        queryApi[Query API]
    end

    ui -->|commands| cmdApi
    ui -->|queries| queryApi
    cmdApi --> cmdHandler
    cmdHandler --> aggregate
    aggregate -->|domain events| eventBus
    eventBus --> eventStore
    eventBus --> projector
    projector --> readDb
    queryApi --> readDb

    style ui fill:#8b5cf6,color:#fff,stroke:#8b5cf6
    style cmdApi fill:#ef4444,color:#fff,stroke:#ef4444
    style cmdHandler fill:#ef4444,color:#fff,stroke:#ef4444
    style aggregate fill:#ef4444,color:#fff,stroke:#ef4444
    style eventBus fill:#ec4899,color:#fff,stroke:#ec4899
    style eventStore fill:#f59e0b,color:#fff,stroke:#f59e0b
    style projector fill:#3b82f6,color:#fff,stroke:#3b82f6
    style readDb fill:#f59e0b,color:#fff,stroke:#f59e0b
    style queryApi fill:#3b82f6,color:#fff,stroke:#3b82f6`,
  },
  {
    id: 'load-balanced',
    name: 'Load Balanced Multi-Tier',
    category: 'architecture',
    description: 'Load balancer, app servers, cache, primary/replica DB',
    diagramType: 'flowchart',
    mermaidCode: `flowchart TB
    subgraph Clients
        users(("Users"))
    end

    subgraph Edge
        cdn{{CDN}}
        lb[Load Balancer]
    end

    subgraph AppTier["Application Tier"]
        app1[App Server 1]
        app2[App Server 2]
        app3[App Server 3]
    end

    subgraph CacheTier["Cache Layer"]
        redis[(Redis Cluster)]
    end

    subgraph DataTier["Database Tier"]
        primary[(Primary DB)]
        replica1[(Replica 1)]
        replica2[(Replica 2)]
    end

    users --> cdn
    users --> lb
    lb --> app1
    lb --> app2
    lb --> app3
    app1 --> redis
    app2 --> redis
    app3 --> redis
    app1 --> primary
    app2 --> primary
    app3 --> primary
    primary -->|replication| replica1
    primary -->|replication| replica2

    style users fill:#3b82f6,color:#fff,stroke:#3b82f6
    style cdn fill:#6b7280,color:#fff,stroke:#6b7280
    style lb fill:#8b5cf6,color:#fff,stroke:#8b5cf6
    style app1 fill:#10b981,color:#fff,stroke:#10b981
    style app2 fill:#10b981,color:#fff,stroke:#10b981
    style app3 fill:#10b981,color:#fff,stroke:#10b981
    style redis fill:#ef4444,color:#fff,stroke:#ef4444
    style primary fill:#f59e0b,color:#fff,stroke:#f59e0b
    style replica1 fill:#f59e0b,color:#fff,stroke:#f59e0b
    style replica2 fill:#f59e0b,color:#fff,stroke:#f59e0b`,
  },

  // ── Data Modeling ──
  {
    id: 'ecommerce-er',
    name: 'E-Commerce Schema',
    category: 'data',
    description: 'Users, Orders, Products, Categories, Reviews',
    diagramType: 'er',
    mermaidCode: `erDiagram
    USER {
        int id PK
        string email UK
        string name
        string password_hash
        datetime created_at
    }
    CATEGORY {
        int id PK
        string name
        string slug UK
        int parent_id FK
    }
    PRODUCT {
        int id PK
        string name
        decimal price
        int stock
        int category_id FK
        datetime created_at
    }
    ORDER {
        int id PK
        int user_id FK
        decimal total
        string status
        datetime created_at
    }
    ORDER_ITEM {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
        decimal unit_price
    }
    REVIEW {
        int id PK
        int user_id FK
        int product_id FK
        int rating
        text comment
        datetime created_at
    }
    PAYMENT {
        int id PK
        int order_id FK
        string method
        string status
        decimal amount
        datetime paid_at
    }

    USER ||--o{ ORDER : places
    USER ||--o{ REVIEW : writes
    ORDER ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : "included in"
    PRODUCT ||--o{ REVIEW : "reviewed by"
    CATEGORY ||--o{ PRODUCT : categorizes
    ORDER ||--|| PAYMENT : "paid via"`,
  },
  {
    id: 'blog-er',
    name: 'Blog Platform Schema',
    category: 'data',
    description: 'Authors, Posts, Comments, Tags, Categories',
    diagramType: 'er',
    mermaidCode: `erDiagram
    AUTHOR {
        int id PK
        string username UK
        string email UK
        string bio
        string avatar_url
        datetime joined_at
    }
    POST {
        int id PK
        int author_id FK
        string title
        text content
        string slug UK
        string status
        datetime published_at
    }
    COMMENT {
        int id PK
        int post_id FK
        int author_id FK
        int parent_id FK
        text body
        datetime created_at
    }
    TAG {
        int id PK
        string name UK
        string slug UK
    }
    POST_TAG {
        int post_id FK
        int tag_id FK
    }
    CATEGORY {
        int id PK
        string name
        string slug UK
    }

    AUTHOR ||--o{ POST : writes
    AUTHOR ||--o{ COMMENT : posts
    POST ||--o{ COMMENT : has
    POST ||--o{ POST_TAG : tagged
    TAG ||--o{ POST_TAG : applied
    CATEGORY ||--o{ POST : contains
    COMMENT ||--o{ COMMENT : "replies to"`,
  },

  // ── Software Design ──
  {
    id: 'mvc-class',
    name: 'MVC Pattern',
    category: 'software',
    description: 'Model-View-Controller with service and repository layers',
    diagramType: 'class',
    mermaidCode: `classDiagram
    class Controller {
        -service: Service
        +handleRequest(req) Response
        +handleCreate(data) Response
        +handleUpdate(id, data) Response
        +handleDelete(id) Response
    }
    class Service {
        -repository: Repository
        -validator: Validator
        +findAll() List~Entity~
        +findById(id) Entity
        +create(dto) Entity
        +update(id, dto) Entity
        +delete(id) void
    }
    class Repository {
        <<interface>>
        +findAll() List~Entity~
        +findById(id) Entity
        +save(entity) Entity
        +delete(id) void
    }
    class SQLRepository {
        -db: Database
        +findAll() List~Entity~
        +findById(id) Entity
        +save(entity) Entity
        +delete(id) void
    }
    class Entity {
        +int id
        +string name
        +datetime createdAt
        +datetime updatedAt
    }
    class Validator {
        +validate(data) ValidationResult
    }
    class DTO {
        +string name
        +toEntity() Entity
    }

    Controller --> Service : uses
    Service --> Repository : depends on
    Service --> Validator : validates with
    SQLRepository ..|> Repository : implements
    Service ..> DTO : accepts
    Repository ..> Entity : manages`,
  },
  {
    id: 'observer-class',
    name: 'Observer Pattern',
    category: 'software',
    description: 'Subject, Observer interface, and concrete implementations',
    diagramType: 'class',
    mermaidCode: `classDiagram
    class EventEmitter {
        -listeners: Map~string, List~Listener~~
        +on(event, listener) void
        +off(event, listener) void
        +emit(event, data) void
    }
    class Listener {
        <<interface>>
        +handle(data) void
    }
    class EmailNotifier {
        -emailService: EmailService
        +handle(data) void
    }
    class Logger {
        -logLevel: string
        +handle(data) void
    }
    class MetricsCollector {
        -metricsClient: MetricsClient
        +handle(data) void
    }
    class WebhookNotifier {
        -url: string
        -httpClient: HttpClient
        +handle(data) void
    }

    EventEmitter o-- Listener : notifies
    EmailNotifier ..|> Listener
    Logger ..|> Listener
    MetricsCollector ..|> Listener
    WebhookNotifier ..|> Listener`,
  },

  // ── Sequence Diagrams ──
  {
    id: 'auth-flow',
    name: 'OAuth2 Auth Flow',
    category: 'architecture',
    description: 'OAuth2 authorization code flow with token refresh',
    diagramType: 'sequence',
    mermaidCode: `sequenceDiagram
    actor User
    participant Browser
    participant App as App Server
    participant Auth as Auth Provider
    participant DB as Database

    User->>Browser: Click "Sign In"
    Browser->>Auth: Redirect to /authorize
    Auth->>User: Show login page
    User->>Auth: Enter credentials
    Auth->>Auth: Validate credentials
    Auth->>Browser: Redirect with auth code
    Browser->>App: POST /callback (auth code)
    App->>Auth: Exchange code for tokens
    Auth-->>App: Access token + Refresh token
    App->>DB: Store refresh token
    App-->>Browser: Set session cookie
    Browser-->>User: Logged in

    Note over Browser,Auth: Token Refresh Flow
    Browser->>App: API request (expired token)
    App->>Auth: POST /token (refresh token)
    Auth-->>App: New access token
    App-->>Browser: Response + new cookie`,
  },
  {
    id: 'api-crud-flow',
    name: 'REST API CRUD Flow',
    category: 'architecture',
    description: 'Complete CRUD operations with validation and caching',
    diagramType: 'sequence',
    mermaidCode: `sequenceDiagram
    actor Client
    participant API as API Gateway
    participant Auth as Auth Middleware
    participant Svc as Service Layer
    participant Cache as Redis Cache
    participant DB as Database

    Note over Client,DB: CREATE
    Client->>API: POST /resources
    API->>Auth: Validate JWT
    Auth-->>API: OK
    API->>Svc: create(data)
    Svc->>DB: INSERT
    DB-->>Svc: new record
    Svc->>Cache: invalidate list
    Svc-->>Client: 201 Created

    Note over Client,DB: READ (cache hit)
    Client->>API: GET /resources/:id
    API->>Svc: findById(id)
    Svc->>Cache: get(key)
    Cache-->>Svc: cached data
    Svc-->>Client: 200 OK

    Note over Client,DB: UPDATE
    Client->>API: PUT /resources/:id
    API->>Auth: Validate JWT
    Auth-->>API: OK
    API->>Svc: update(id, data)
    Svc->>DB: UPDATE
    DB-->>Svc: updated record
    Svc->>Cache: invalidate(key)
    Svc-->>Client: 200 OK

    Note over Client,DB: DELETE
    Client->>API: DELETE /resources/:id
    API->>Auth: Validate JWT
    Auth-->>API: OK
    API->>Svc: delete(id)
    Svc->>DB: DELETE
    Svc->>Cache: invalidate(key)
    Svc-->>Client: 204 No Content`,
  },

  // ── DevOps ──
  {
    id: 'cicd-pipeline',
    name: 'CI/CD Pipeline',
    category: 'devops',
    description: 'Build, test, security scan, staging, and production deploy',
    diagramType: 'flowchart',
    mermaidCode: `flowchart LR
    subgraph Trigger
        push[/"Git Push"\\]
        pr[/"Pull Request"\\]
    end

    subgraph Build
        install[Install Deps]
        lint[Lint]
        compile[Compile/Build]
    end

    subgraph Test
        unit[Unit Tests]
        integration[Integration Tests]
        e2e[E2E Tests]
    end

    subgraph Security
        sast[SAST Scan]
        deps[Dep Audit]
    end

    subgraph Deploy
        staging[Deploy Staging]
        smoke[Smoke Tests]
        approval{Manual Approval}
        prod[Deploy Production]
        monitor[Health Check]
    end

    push --> install
    pr --> install
    install --> lint
    lint --> compile
    compile --> unit
    unit --> integration
    integration --> e2e
    e2e --> sast
    sast --> deps
    deps --> staging
    staging --> smoke
    smoke --> approval
    approval -->|approved| prod
    prod --> monitor

    style push fill:#8b5cf6,color:#fff,stroke:#8b5cf6
    style pr fill:#8b5cf6,color:#fff,stroke:#8b5cf6
    style install fill:#3b82f6,color:#fff,stroke:#3b82f6
    style lint fill:#3b82f6,color:#fff,stroke:#3b82f6
    style compile fill:#3b82f6,color:#fff,stroke:#3b82f6
    style unit fill:#10b981,color:#fff,stroke:#10b981
    style integration fill:#10b981,color:#fff,stroke:#10b981
    style e2e fill:#10b981,color:#fff,stroke:#10b981
    style sast fill:#f59e0b,color:#fff,stroke:#f59e0b
    style deps fill:#f59e0b,color:#fff,stroke:#f59e0b
    style staging fill:#06b6d4,color:#fff,stroke:#06b6d4
    style smoke fill:#06b6d4,color:#fff,stroke:#06b6d4
    style approval fill:#ec4899,color:#fff,stroke:#ec4899
    style prod fill:#ef4444,color:#fff,stroke:#ef4444
    style monitor fill:#ef4444,color:#fff,stroke:#ef4444`,
  },
  {
    id: 'k8s-architecture',
    name: 'Kubernetes Architecture',
    category: 'devops',
    description: 'Ingress, Services, Deployments, Pods, ConfigMaps, Secrets',
    diagramType: 'flowchart',
    mermaidCode: `flowchart TB
    subgraph External
        users(("Users"))
        dns{{DNS}}
    end

    subgraph Cluster["K8s Cluster"]
        subgraph Ingress
            ingress[Ingress Controller]
        end

        subgraph Namespace_App["app namespace"]
            svcA[Service A]
            svcB[Service B]
            deployA[Deployment A]
            deployB[Deployment B]
            podA1[Pod A-1]
            podA2[Pod A-2]
            podB1[Pod B-1]
        end

        subgraph Namespace_Data["data namespace"]
            svcDB[DB Service]
            stateful[(StatefulSet DB)]
            pvc[("PersistentVolume")]
        end

        subgraph Config
            cm[ConfigMap]
            secret[Secret]
        end
    end

    users --> dns
    dns --> ingress
    ingress --> svcA
    ingress --> svcB
    svcA --> deployA
    svcB --> deployB
    deployA --> podA1
    deployA --> podA2
    deployB --> podB1
    podA1 --> svcDB
    podB1 --> svcDB
    svcDB --> stateful
    stateful --> pvc
    cm -.-> podA1
    cm -.-> podB1
    secret -.-> podA1
    secret -.-> podB1

    style users fill:#3b82f6,color:#fff,stroke:#3b82f6
    style dns fill:#6b7280,color:#fff,stroke:#6b7280
    style ingress fill:#8b5cf6,color:#fff,stroke:#8b5cf6
    style svcA fill:#10b981,color:#fff,stroke:#10b981
    style svcB fill:#10b981,color:#fff,stroke:#10b981
    style deployA fill:#06b6d4,color:#fff,stroke:#06b6d4
    style deployB fill:#06b6d4,color:#fff,stroke:#06b6d4
    style podA1 fill:#3b82f6,color:#fff,stroke:#3b82f6
    style podA2 fill:#3b82f6,color:#fff,stroke:#3b82f6
    style podB1 fill:#3b82f6,color:#fff,stroke:#3b82f6
    style svcDB fill:#10b981,color:#fff,stroke:#10b981
    style stateful fill:#f59e0b,color:#fff,stroke:#f59e0b
    style pvc fill:#f59e0b,color:#fff,stroke:#f59e0b
    style cm fill:#6b7280,color:#fff,stroke:#6b7280
    style secret fill:#ef4444,color:#fff,stroke:#ef4444`,
  },

  // ── C4 Model ──
  {
    id: 'c4-context',
    name: 'C4 System Context',
    category: 'architecture',
    description: 'System context with users, internal system, and external dependencies',
    diagramType: 'c4',
    mermaidCode: `C4Context
    title System Context Diagram - E-Commerce Platform

    Person(customer, "Customer", "Browses products, places orders, leaves reviews")
    Person(admin, "Admin", "Manages products, orders, and users")

    System(ecommerce, "E-Commerce Platform", "Handles product catalog, orders, payments, and user management")

    System_Ext(payment, "Payment Gateway", "Processes credit card and digital wallet payments")
    System_Ext(shipping, "Shipping Provider", "Handles order fulfillment and delivery tracking")
    System_Ext(email, "Email Service", "Sends transactional emails and newsletters")
    System_Ext(analytics, "Analytics Platform", "Collects usage data and generates reports")

    Rel(customer, ecommerce, "Browses, orders", "HTTPS")
    Rel(admin, ecommerce, "Manages", "HTTPS")
    Rel(ecommerce, payment, "Processes payments", "HTTPS/API")
    Rel(ecommerce, shipping, "Ships orders", "HTTPS/API")
    Rel(ecommerce, email, "Sends emails", "SMTP/API")
    Rel(ecommerce, analytics, "Sends events", "HTTPS")`,
  },
  {
    id: 'c4-container',
    name: 'C4 Container Diagram',
    category: 'architecture',
    description: 'Internal containers: SPA, API, workers, databases, message broker',
    diagramType: 'c4',
    mermaidCode: `C4Container
    title Container Diagram - E-Commerce Platform

    Person(customer, "Customer", "End user of the platform")

    System_Boundary(ecommerce, "E-Commerce Platform") {
        Container(spa, "SPA", "React", "Single page application for customers")
        Container(admin_ui, "Admin Panel", "React", "Internal admin dashboard")
        Container(api, "API Server", "Node.js/Express", "REST API handling business logic")
        Container(worker, "Background Worker", "Node.js", "Processes async jobs")
        ContainerDb(db, "Database", "PostgreSQL", "Stores users, products, orders")
        ContainerDb(cache, "Cache", "Redis", "Session store and query cache")
        Container(queue, "Message Broker", "RabbitMQ", "Async job queue")
        ContainerDb(search, "Search Engine", "Elasticsearch", "Full-text product search")
    }

    System_Ext(payment, "Payment Gateway", "Stripe")
    System_Ext(cdn, "CDN", "CloudFront")

    Rel(customer, spa, "Uses", "HTTPS")
    Rel(customer, cdn, "Static assets", "HTTPS")
    Rel(spa, api, "API calls", "HTTPS/JSON")
    Rel(admin_ui, api, "API calls", "HTTPS/JSON")
    Rel(api, db, "Reads/Writes", "TCP")
    Rel(api, cache, "Caches", "TCP")
    Rel(api, queue, "Publishes jobs", "AMQP")
    Rel(api, search, "Queries", "HTTPS")
    Rel(worker, queue, "Consumes", "AMQP")
    Rel(worker, db, "Reads/Writes", "TCP")
    Rel(api, payment, "Processes payments", "HTTPS")`,
  },

  // ── State Diagrams ──
  {
    id: 'order-state',
    name: 'Order State Machine',
    category: 'software',
    description: 'Order lifecycle: created, paid, shipped, delivered, cancelled',
    diagramType: 'state',
    mermaidCode: `stateDiagram-v2
    [*] --> Draft
    Draft --> Submitted : customer submits
    Submitted --> Paid : payment confirmed
    Submitted --> Cancelled : customer cancels
    Paid --> Processing : warehouse picks
    Processing --> Shipped : carrier collected
    Shipped --> Delivered : delivery confirmed
    Shipped --> ReturnRequested : customer requests return
    Delivered --> [*]
    ReturnRequested --> Returned : return received
    Returned --> Refunded : refund issued
    Refunded --> [*]
    Cancelled --> [*]

    state Processing {
        [*] --> Picking
        Picking --> Packing
        Packing --> ReadyToShip
        ReadyToShip --> [*]
    }`,
  },
  {
    id: 'auth-state',
    name: 'Authentication State',
    category: 'software',
    description: 'User authentication flow: logged out, authenticating, logged in, locked',
    diagramType: 'state',
    mermaidCode: `stateDiagram-v2
    [*] --> LoggedOut

    LoggedOut --> Authenticating : enter credentials
    Authenticating --> LoggedIn : valid credentials
    Authenticating --> LoggedOut : invalid credentials
    Authenticating --> Locked : max attempts reached

    LoggedIn --> TokenRefresh : token expiring
    TokenRefresh --> LoggedIn : refresh success
    TokenRefresh --> LoggedOut : refresh failed

    LoggedIn --> LoggedOut : logout
    Locked --> LoggedOut : timeout expires
    Locked --> LoggedOut : admin unlock

    state LoggedIn {
        [*] --> Active
        Active --> Idle : no activity 5min
        Idle --> Active : user interaction
        Idle --> SessionExpired : timeout 30min
        SessionExpired --> [*]
    }`,
  },

  // ── Gantt Charts ──
  {
    id: 'sprint-gantt',
    name: 'Sprint Planning',
    category: 'devops',
    description: 'Two-week sprint with design, development, testing, and release phases',
    diagramType: 'gantt',
    mermaidCode: `gantt
    title Sprint 24 - User Profile Redesign
    dateFormat YYYY-MM-DD
    axisFormat %b %d

    section Design
        UX Research           :done,    des1, 2025-01-06, 2d
        Wireframes            :done,    des2, after des1, 2d
        UI Mockups            :active,  des3, after des2, 2d
        Design Review         :         des4, after des3, 1d

    section Backend
        API Design            :         be1, after des2, 2d
        Database Migration    :         be2, after be1, 1d
        API Implementation    :         be3, after be2, 3d
        Unit Tests            :         be4, after be3, 1d

    section Frontend
        Component Scaffolding :         fe1, after des4, 1d
        Profile Page          :         fe2, after fe1, 3d
        Settings Page         :         fe3, after fe2, 2d
        Integration           :         fe4, after fe3, 1d

    section QA
        E2E Tests             :         qa1, after fe4, 2d
        Bug Fixes             :crit,    qa2, after qa1, 1d
        Release               :milestone, rel, after qa2, 0d`,
  },
  {
    id: 'project-gantt',
    name: 'Project Roadmap',
    category: 'devops',
    description: 'Quarterly project roadmap with milestones and dependencies',
    diagramType: 'gantt',
    mermaidCode: `gantt
    title Q1 2025 Product Roadmap
    dateFormat YYYY-MM-DD
    axisFormat %b %d

    section Infrastructure
        Cloud Migration        :done,  infra1, 2025-01-06, 15d
        CI/CD Pipeline         :done,  infra2, after infra1, 10d
        Monitoring Setup       :active, infra3, after infra2, 7d

    section Core Platform
        Auth System Rewrite    :       core1, 2025-01-20, 20d
        API v2                 :       core2, after core1, 15d
        Performance Optimization:      core3, after core2, 10d

    section Features
        Search Engine          :       feat1, after infra3, 12d
        Real-time Notifications:       feat2, after feat1, 8d
        Export/Import          :       feat3, after feat2, 6d

    section Launch
        Beta Testing           :crit,  launch1, after core3, 10d
        Documentation          :       launch2, after feat3, 5d
        Public Launch          :milestone, launch3, after launch1, 0d`,
  },

  // ── Pie Charts ──
  {
    id: 'tech-stack-pie',
    name: 'Tech Stack Distribution',
    category: 'software',
    description: 'Codebase language distribution breakdown',
    diagramType: 'pie',
    mermaidCode: `pie title Codebase Language Distribution
    "TypeScript" : 42
    "Python" : 25
    "Go" : 15
    "SQL" : 10
    "Shell/YAML" : 5
    "Other" : 3`,
  },
  {
    id: 'incident-pie',
    name: 'Incident Categories',
    category: 'devops',
    description: 'Distribution of production incidents by category',
    diagramType: 'pie',
    mermaidCode: `pie title Production Incidents Q4 2024
    "Infrastructure" : 28
    "Application Bugs" : 24
    "Database" : 18
    "Network/DNS" : 12
    "Third-party API" : 10
    "Security" : 5
    "Human Error" : 3`,
  },

  // ── Mind Maps ──
  {
    id: 'system-design-mindmap',
    name: 'System Design Checklist',
    category: 'architecture',
    description: 'System design interview checklist with key areas and considerations',
    diagramType: 'mindmap',
    mermaidCode: `mindmap
  root((System Design))
    Requirements
      Functional
        Core Features
        User Flows
        API Contracts
      Non-Functional
        Scalability
        Latency SLA
        Availability
        Consistency
    Architecture
      Client Layer
        Web SPA
        Mobile App
        CDN
      Application Layer
        API Gateway
        Load Balancer
        Microservices
      Data Layer
        SQL Database
        NoSQL Store
        Cache
        Message Queue
    Scalability
      Horizontal Scaling
      Database Sharding
      Read Replicas
      Caching Strategy
    Reliability
      Redundancy
      Failover
      Circuit Breaker
      Health Checks
    Monitoring
      Metrics
      Logging
      Alerting
      Tracing`,
  },
  {
    id: 'frontend-mindmap',
    name: 'Frontend Architecture',
    category: 'software',
    description: 'Frontend project structure and technology decisions',
    diagramType: 'mindmap',
    mermaidCode: `mindmap
  root((Frontend App))
    Framework
      React
      TypeScript
      Vite
    Styling
      Tailwind CSS
      CSS Modules
      Design Tokens
    State Management
      Local State
        useState
        useReducer
      Server State
        React Query
        SWR
      Global State
        Context API
        Zustand
    Testing
      Unit Tests
        Vitest
        React Testing Library
      E2E Tests
        Playwright
      Visual Regression
        Chromatic
    Build & Deploy
      CI/CD
      Bundle Analysis
      Code Splitting
      CDN`,
  },

  // ── Timeline ──
  {
    id: 'release-timeline',
    name: 'Release History',
    category: 'devops',
    description: 'Product version releases with key features per version',
    diagramType: 'timeline',
    mermaidCode: `timeline
    title Product Release History
    section 2024 Q1
        v1.0 : Initial Launch
             : Core API
             : Basic UI
    section 2024 Q2
        v1.1 : Search Feature
             : OAuth Integration
        v1.2 : Real-time Notifications
             : Mobile Responsive
    section 2024 Q3
        v2.0 : Complete UI Redesign
             : GraphQL API
             : Plugin System
        v2.1 : Performance Optimizations
             : Caching Layer
    section 2024 Q4
        v2.2 : AI-powered Search
             : Collaborative Editing
        v3.0-beta : Multi-tenancy
                  : Custom Workflows
                  : Webhook System`,
  },

  // ── Git Graph ──
  {
    id: 'gitflow',
    name: 'Git Flow Branching',
    category: 'devops',
    description: 'Gitflow branching model with feature, release, and hotfix branches',
    diagramType: 'gitgraph',
    mermaidCode: `gitGraph
    commit id: "init"
    branch develop
    checkout develop
    commit id: "setup"
    branch feature/auth
    checkout feature/auth
    commit id: "auth-model"
    commit id: "auth-api"
    commit id: "auth-tests"
    checkout develop
    merge feature/auth id: "merge-auth"
    branch feature/dashboard
    checkout feature/dashboard
    commit id: "dashboard-ui"
    commit id: "dashboard-api"
    checkout develop
    merge feature/dashboard id: "merge-dashboard"
    branch release/1.0
    checkout release/1.0
    commit id: "bump-version"
    commit id: "fix-typo"
    checkout main
    merge release/1.0 id: "v1.0" tag: "v1.0.0"
    checkout develop
    merge release/1.0 id: "back-merge"
    checkout main
    branch hotfix/1.0.1
    commit id: "critical-fix"
    checkout main
    merge hotfix/1.0.1 id: "v1.0.1" tag: "v1.0.1"
    checkout develop
    merge hotfix/1.0.1 id: "hotfix-merge"`,
  },

  // ── Quadrant Chart ──
  {
    id: 'tech-prioritization',
    name: 'Tech Debt Prioritization',
    category: 'software',
    description: 'Effort vs Impact quadrant for technical debt items',
    diagramType: 'quadrant',
    mermaidCode: `quadrantChart
    title Tech Debt Prioritization
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    quadrant-1 Do First
    quadrant-2 Plan Carefully
    quadrant-3 Quick Wins
    quadrant-4 Deprioritize
    Upgrade Node.js: [0.3, 0.9]
    Add TypeScript strict: [0.7, 0.8]
    Fix N+1 queries: [0.2, 0.85]
    Migrate to ESM: [0.8, 0.4]
    Update CI config: [0.15, 0.3]
    Refactor auth module: [0.6, 0.75]
    Add API rate limiting: [0.35, 0.7]
    Remove dead code: [0.1, 0.2]
    Redesign DB schema: [0.9, 0.9]
    Add request logging: [0.25, 0.5]`,
  },
];

// ── Starter templates for new diagram types in NLP text mode ──
// When a user picks a type that NLP can't parse, we load a starter template they can edit.

export const STARTER_TEMPLATES: Partial<Record<DiagramType, string>> = {
  class: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound() void
    }
    class Dog {
        +String breed
        +fetch() void
    }
    class Cat {
        +bool isIndoor
        +purr() void
    }
    Animal <|-- Dog
    Animal <|-- Cat`,

  er: `erDiagram
    USER {
        int id PK
        string name
        string email UK
    }
    POST {
        int id PK
        int user_id FK
        string title
        text content
    }
    COMMENT {
        int id PK
        int post_id FK
        int user_id FK
        text body
    }
    USER ||--o{ POST : writes
    USER ||--o{ COMMENT : posts
    POST ||--o{ COMMENT : has`,

  c4: `C4Context
    title System Context Diagram
    Person(user, "User", "End user of the system")
    System(app, "Application", "Core application")
    System_Ext(ext, "External Service", "Third-party API")
    Rel(user, app, "Uses", "HTTPS")
    Rel(app, ext, "Calls", "HTTPS/API")`,

  state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : start
    Processing --> Success : completed
    Processing --> Error : failed
    Error --> Idle : retry
    Success --> [*]`,

  gantt: `gantt
    title Project Plan
    dateFormat YYYY-MM-DD
    axisFormat %b %d

    section Phase 1
        Task A :a1, 2025-01-06, 5d
        Task B :a2, after a1, 3d
    section Phase 2
        Task C :b1, after a2, 4d
        Task D :b2, after b1, 3d`,

  pie: `pie title Distribution
    "Category A" : 40
    "Category B" : 30
    "Category C" : 20
    "Category D" : 10`,

  mindmap: `mindmap
  root((Topic))
    Branch 1
      Leaf 1A
      Leaf 1B
    Branch 2
      Leaf 2A
      Leaf 2B
    Branch 3
      Leaf 3A`,

  timeline: `timeline
    title Project Timeline
    section Phase 1
        Milestone A : Detail 1
                    : Detail 2
    section Phase 2
        Milestone B : Detail 3
        Milestone C : Detail 4`,

  gitgraph: `gitGraph
    commit id: "init"
    branch develop
    checkout develop
    commit id: "feat-1"
    commit id: "feat-2"
    checkout main
    merge develop id: "release" tag: "v1.0"`,

  quadrant: `quadrantChart
    title Priority Matrix
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    quadrant-1 Do First
    quadrant-2 Plan
    quadrant-3 Quick Wins
    quadrant-4 Skip
    Item A: [0.2, 0.8]
    Item B: [0.7, 0.9]
    Item C: [0.3, 0.3]
    Item D: [0.8, 0.4]`,
};
