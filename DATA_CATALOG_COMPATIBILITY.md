# Data Catalog — Compatibility Report

## Feature scope
- Display all user datasets (uploaded files + registered DB tables) with tables, columns, data types
- Display all database connections with their complete table inventories (registered + unregistered tables)
- Show column relationships (foreign keys) for database-backed tables
- Frontend page at `/catalog` with tree-navigation + table-detail panel

---

## Existing infrastructure reused (zero duplication)

### Backend

| Existing asset | Reused as |
|---|---|
| `ConnectionService.list_tables(connection_id)` | Fetches all tables in a connection (registered + unregistered) |
| `ConnectionService.describe_table(connection_id, schema, table)` | Returns columns for any DB table |
| `ConnectionService.get_engine(connection_id)` | Provides SQLAlchemy engine; new `get_foreign_keys()` uses same `inspect()` pattern |
| `DatasetService.list_datasets(owner_sub)` | Returns all registered datasets with `db_columns` already stored |
| `DatasetService.get_preview(dataset_id)` | Returns `data_types` dict for file datasets (lazy-loaded per-column detail) |
| `ConnectionService._read_record(id)` → `owner_sub` | Existing ownership guard reused in new route |
| `_assert_connection_owner()` helper in `connections.py` | Reused directly in the new describe route |
| `app.schemas.connection.TableColumn` | Reused as the column schema in `TableSchemaResponse` |
| `app.schemas.dataset.DatasetMetadata.db_columns` | Pre-stored column info — no new DB call needed for registered DB tables |
| `HexId` path parameter type | Reused in new route path |
| `get_connection_service()` dependency factory | Reused — no new dependency |
| Auth pattern (`get_current_user`, `owner_sub`, 404 for wrong owner) | Applied identically to new route |

### Frontend

| Existing asset | Reused as |
|---|---|
| `listDatasets()` in `datasets.ts` | Fetches all registered file + DB table datasets |
| `getDatasetPreview(id)` in `datasets.ts` | Lazy-loads column types for file datasets |
| `listConnections()` in `connections.ts` | Fetches all user connections |
| `listTables(id)` in `connections.ts` | Fetches all tables in a connection (for the catalog tree) |
| `DatasetMetadata` type in `types.ts` | Already has `db_columns`, `column_names`, `connection_id`, `table_name`, `db_schema` |
| `ConnectionMetadata` type in `types.ts` | Connection info for the tree |
| `TableInfo`, `TableListResponse` in `types.ts` | Raw table list from each connection |
| TanStack Query v5 `useQuery` | Data fetching pattern |
| Framer Motion / Tailwind patterns | Consistent styling |
| Sidebar nav group pattern | Add "Catalog" under Workspace group |

---

## What is NOT needed

- No new storage directories or config changes
- No new service classes
- No new LLM calls (catalog is 100% deterministic)
- No changes to `DatasetService`
- No changes to any existing route
- No new Pydantic schemas for datasets or connections (all existing)

---

## Backend changes (minimal)

### Modified files (2)

| File | Change |
|---|---|
| `backend/app/services/connection_service.py` | Add `get_foreign_keys(connection_id, schema, table) -> list[ForeignKeyInfo]` method — 15 lines, reuses existing `inspect()` call pattern from `describe_table()` |
| `backend/app/api/routes/connections.py` | Add one new route: `GET /{connection_id}/describe?table=X&schema=Y` → returns `TableSchemaResponse` (columns + FKs) |

### New files (2)

| File | Purpose |
|---|---|
| `backend/app/schemas/catalog.py` | `ForeignKeyInfo`, `TableSchemaResponse` — the only new schemas |
| `backend/app/api/routes/catalog.py` | NOT needed — the new route is added to the existing connections router |

Note: The new route is added to `connections.py` (not a new file) because it's a natural extension of the connection resource: `GET /connections/{id}/describe`. This keeps the routes.py count the same.

---

## New API endpoint

```
GET /api/v1/connections/{connection_id}/describe?table=orders&schema=public
```

**Returns:** `TableSchemaResponse`
```python
class ForeignKeyInfo(BaseModel):
    name: Optional[str]
    constrained_columns: list[str]
    referred_schema: Optional[str]
    referred_table: str
    referred_columns: list[str]

class TableSchemaResponse(BaseModel):
    table: str
    schema_name: Optional[str]
    columns: list[TableColumn]      # reuses existing TableColumn schema
    foreign_keys: list[ForeignKeyInfo]
```

**Reuses:** `_assert_connection_owner()`, `ConnectionService.describe_table()`, new `get_foreign_keys()`

---

## Frontend changes

### New files (3)

| File | Purpose |
|---|---|
| `src/lib/api/catalog.ts` | `describeTable(connId, table, schema?)` API function |
| `src/components/catalog/CatalogWorkspace.tsx` | Tree + detail panel workspace |
| `src/app/catalog/page.tsx` | Next.js App Router page |

### Modified files (2)

| File | Change |
|---|---|
| `src/lib/api/types.ts` | Append `ForeignKeyInfo`, `TableSchemaResponse` |
| `src/components/layout/Sidebar.tsx` | Add `{ href: "/catalog", label: "Catalog", icon: BookOpen }` under Workspace group |

### No changes to

- `src/lib/api/datasets.ts` — `listDatasets()` + `getDatasetPreview()` already exist and are called directly
- `src/lib/api/connections.ts` — `listConnections()` + `listTables()` already exist; `describeTable()` goes in `catalog.ts`
- Any other existing API file

---

## Data flow

```
CatalogWorkspace mounts
    │
    ├─ useQuery(["datasets"]) → GET /api/v1/datasets
    │    Returns: list of registered datasets (file + DB table)
    │    File datasets:     column_names (no types until expanded)
    │    DB table datasets: db_columns (name, data_type, is_numeric) ← already stored
    │
    ├─ useQuery(["connections"]) → GET /api/v1/connections
    │    Returns: list of connections (id, name, db_type, host, database)
    │
    └─ For each connection: useQuery(["tables", connId]) → GET /api/v1/connections/{id}/tables
         Returns: all tables including unregistered ones

User selects a table from the tree
    │
    ├─ If DB table: useQuery(["describe", connId, schema, table])
    │    → GET /api/v1/connections/{id}/describe?table=X&schema=Y
    │    Returns: { columns, foreign_keys }
    │
    └─ If file dataset: useQuery(["preview", datasetId])
         → GET /api/v1/datasets/{id}/preview
         Returns: { data_types, preview_rows, ... }
```

---

## UI layout

```
┌─────────────────────────────────────────────────────────────┐
│  /catalog                                                     │
│                                                               │
│  ┌───────────────────┐  ┌───────────────────────────────────┐│
│  │ Tree Panel        │  │ Detail Panel                      ││
│  │                   │  │                                   ││
│  │ ▼ File Datasets   │  │ orders          [database]        ││
│  │   sales.csv       │  │ 15,432 rows · 8 columns           ││
│  │   report.xlsx     │  │                                   ││
│  │                   │  │ ┌─ Columns ──────────────────────┐││
│  │ ▼ my_postgres_db  │  │ │ id          INTEGER  numeric   │││
│  │   ▼ public        │  │ │ user_id     INTEGER  numeric   │││
│  │     orders ●      │  │ │ amount      NUMERIC  numeric   │││
│  │     users  ●      │  │ │ created_at  TIMESTAMP          │││
│  │     products      │  │ └───────────────────────────────┘││
│  │                   │  │                                   ││
│  │ ▼ my_mysql_db     │  │ ┌─ Relationships ────────────────┐││
│  │   ...             │  │ │ user_id → users.id (fk_orders) │││
│  │                   │  │ └───────────────────────────────┘││
│  └───────────────────┘  └───────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘

● = registered as dataset (has a link to /datasets/{id}/ask)
  = unregistered table (columns loaded on-demand from /describe)
```

---

## `get_foreign_keys()` implementation

```python
def get_foreign_keys(
    self, connection_id: str, schema: Optional[str], table: str
) -> list[ForeignKeyInfo]:
    """Return foreign key constraints for a table."""
    engine = self.get_engine(connection_id)
    try:
        inspector = inspect(engine)
        raw_fks = inspector.get_foreign_keys(table, schema=schema)
    except SQLAlchemyError as exc:
        raise DatabaseError("Failed to get foreign keys.") from exc
    return [
        ForeignKeyInfo(
            name=fk.get("name"),
            constrained_columns=[str(c) for c in fk["constrained_columns"]],
            referred_schema=fk.get("referred_schema"),
            referred_table=fk["referred_table"],
            referred_columns=[str(c) for c in fk["referred_columns"]],
        )
        for fk in raw_fks
    ]
```

`inspector.get_foreign_keys()` is documented SQLAlchemy API — same object already used in `list_tables()` and `describe_table()`. No new imports needed.

---

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| DB with hundreds of tables is slow to load | Low | Tables list uses existing `list_tables()` which is a fast `inspect()` call; columns + FKs are only fetched on expand |
| `get_foreign_keys()` not supported by all DB drivers | Low | SQLite has no FKs (returns empty list by default); MySQL returns FKs only if using InnoDB; this is a best-effort display |
| Foreign key refers to unregistered table | None | We display the FK as-is (`referred_table` name); no resolution needed |
| Unregistered table names with special chars in URL | Low | Use query param `?table=X` not path param to avoid URL encoding issues |
| File dataset column types require extra API call | None | Lazy-loaded only when user expands a file dataset; acceptable UX |
| Catalog page makes N connection table-list calls | Low | One call per connection, stale for 30s; bounded by number of user connections |

---

## Summary of what is new vs reused

| Component | Status |
|---|---|
| Schema discovery via SQLAlchemy `inspect()` | **Existing** — `describe_table()` already does this |
| FK discovery via `inspector.get_foreign_keys()` | **New** — 15-line addition to ConnectionService |
| Column types for DB tables | **Existing** — stored in `DatasetMetadata.db_columns` |
| Column types for file datasets | **Existing** — from `DatasetPreview.data_types` |
| Table list per connection | **Existing** — `list_tables()` |
| Dataset list | **Existing** — `list_datasets()` |
| All frontend API functions except `describeTable()` | **Existing** |
| `describeTable()` | **New** — wraps the new `/describe` route |
