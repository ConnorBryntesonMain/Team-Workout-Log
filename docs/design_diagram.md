```mermaid
flowchart LR
    Client["React client<br/>Browser UI"] -->|Request| API["Node/Express API<br/>Business logic"]
    API -.->|Response| Client

    API -->|Request| DB[("PostgreSQL database<br/>Persistent storage")]
    DB -.->|Response| API

    API -->|Sends token| Auth["Auth service<br/>Third-party login"]
    Auth -.->|Returns validity| API
```

---


