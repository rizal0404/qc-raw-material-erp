# Master Data API Contract — v0.3.0

Base prefix: `/api/v1`

All endpoints require an authenticated session. CRUD/list administration endpoints require `SUPERVISOR_ADMIN`. Lookup endpoints are role-aware and return ACTIVE values only.

## Common list query

```text
search=<text>
active=all|true|false
limit=1..250
 offset>=0
```

Response:

```json
{
  "ok": true,
  "items": [],
  "total": 0
}
```

## Vendors

```http
GET    /vendors
POST   /vendors
PATCH  /vendors/:id
```

Create example:

```json
{
  "code": "TOPABIRING",
  "name": "PT Topabiring Trans Logistic",
  "aliases": ["PT. TOPABIRING TRANS LOGISTIC"],
  "contactEmail": null
}
```

Update can include `active`. If active state changes, `reason` is mandatory.

## Equipment

```http
GET    /equipment?vendorId=<uuid>&type=AA
POST   /equipment
PATCH  /equipment/:id
```

Create:

```json
{
  "vendorId": "<uuid>",
  "type": "AA",
  "unitNo": "112",
  "brand": "Komatsu",
  "model": null,
  "aliases": []
}
```

Business key:

```text
vendor_id + type + unit_no
```

## Crushers

```http
GET    /crushers?materialKind=LS&plantId=<uuid>
POST   /crushers
PATCH  /crushers/:id
```

Canonical initial crusher codes remain:

```text
CR_LS_23
CR_LS_4
CR_LS_5
CR_CY_4
CR_CY_5
```

## Sources

```http
GET    /sources?materialKind=LS&materialCategory=PILE
POST   /sources
PATCH  /sources/:id
```

Create:

```json
{
  "code": "B9_TENGAH",
  "name": "B9 Tengah",
  "block": "B9",
  "materialCategory": "PILE",
  "materialKind": "LS",
  "aliases": []
}
```

## Plants

```http
GET    /plants
POST   /plants
PATCH  /plants/:id
```

## Piles

```http
GET    /piles?materialKind=LS&plantId=<uuid>
POST   /piles
PATCH  /piles/:id
```

## Lookups

### Bootstrap

```http
GET /lookups/master
```

Response shape:

```json
{
  "ok": true,
  "vendors": [],
  "plants": [],
  "crushers": [],
  "sources": [],
  "piles": [],
  "shifts": [],
  "materialCategories": ["PILE", "FILLER"]
}
```

### Equipment

```http
GET /lookups/equipment?vendorId=<uuid>&type=AM
```

This endpoint is intentionally separate because equipment can grow much larger than the static master bootstrap.

## Error codes introduced/used

```text
VALIDATION_ERROR
NOT_FOUND
MASTER_CODE_EXISTS
VENDOR_ALIAS_EXISTS
EQUIPMENT_EXISTS
REASON_REQUIRED
FORBIDDEN
AUTH_REQUIRED
AUTH_EXPIRED
```
