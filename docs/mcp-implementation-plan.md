# Plan d'implémentation MCP & API — Louez

> Serveur MCP (Model Context Protocol) + couche service transport-agnostique préparant une future API REST publique.

---

## 1. Vue d'ensemble

### 1.1. Objectif

Créer un package `@louez/mcp` dans le monorepo qui expose un serveur MCP complet permettant aux loueurs (propriétaires de boutique) de piloter leur activité de location à travers un assistant IA — Claude, GPT, ou tout client MCP compatible.

En parallèle, architecturer une **couche service partagée** qui pourra être réutilisée par une future API REST publique sans refactoring.

### 1.2. Pourquoi un MCP ?

Le MCP (Model Context Protocol) est le standard ouvert pour connecter des LLM à des sources de données et outils externes. Pour Louez, cela signifie :

- **Gestion conversationnelle** : un loueur peut demander « Montre-moi les réservations en retard cette semaine » ou « Crée un produit vélo électrique à 45€/jour »
- **Automatisation** : création de réservations manuelles, gestion des paiements, mise à jour de statuts — tout via le langage naturel
- **Extensibilité open-source** : un MCP bien architecturé permet à la communauté de construire des intégrations personnalisées

### 1.3. Vision REST API (futur)

Le MCP est le premier consommateur d'une couche service partagée. La même couche servira de base à une **API REST publique** lorsque le besoin business apparaîtra (intégrations tierces, channel managers, POS, etc.).

```
oRPC (dashboard)  ──┐
MCP tools          ──┤──▶  Service Layer  ──▶  @louez/db
REST API (futur)   ──┘    (packages/api/src/services/)
```

Cette approche permet d'ajouter une API REST en quelques jours, pas en quelques semaines.

### 1.4. Principes d'architecture

| Principe | Détail |
|----------|--------|
| **Réutilisation maximale** | S'appuyer sur les services `@louez/api`, le schéma `@louez/db` et les validations `@louez/validations` existants |
| **Transport-agnostique** | Les services ne connaissent ni MCP, ni REST, ni oRPC — ils reçoivent des inputs typés et retournent des résultats typés |
| **Isolation multi-tenant** | Chaque session MCP est scoped à un `storeId` — aucune fuite de données cross-tenant |
| **Sécurité first** | Authentification par API key (hachée, stockée en DB), permissions owner/member respectées |
| **Exemplaire OSS** | Code documenté, typé, testé, suivant les conventions du projet |
| **SDK officiel** | Utilisation du `@modelcontextprotocol/sdk` v1.x (stable, recommandé pour la production) |

---

## 2. Architecture technique

### 2.1. Couche service partagée (transport-agnostique)

L'innovation clé : chaque opération métier est un **service pur** dans `packages/api/src/services/`. Les services :

- Reçoivent un input typé + un `storeId` (jamais de contexte HTTP/MCP)
- Retournent un résultat typé ou lancent une erreur métier
- N'importent aucun module spécifique au transport

```typescript
// packages/api/src/services/reservations.ts
// Ce service est appelé par oRPC, MCP, et (futur) REST

export interface ListReservationsInput {
  storeId: string
  status?: ReservationStatus
  search?: string
  page?: number
  pageSize?: number
}

export interface ListReservationsResult {
  items: ReservationSummary[]
  total: number
  page: number
  pageSize: number
}

export async function listReservations(
  input: ListReservationsInput
): Promise<ListReservationsResult> {
  // Drizzle query filtré par storeId — réutilisable partout
}
```

### 2.2. Position dans le monorepo

```
louez/
├── packages/
│   ├── mcp/                          # @louez/mcp — NOUVEAU
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts              # Point d'entrée, export du serveur
│   │   │   ├── server.ts             # McpServer setup + registration
│   │   │   ├── auth/
│   │   │   │   ├── api-keys.ts       # Validation et résolution d'API keys
│   │   │   │   └── context.ts        # Contexte de session MCP (store, user, permissions)
│   │   │   ├── tools/
│   │   │   │   ├── index.ts          # Enregistrement centralisé de tous les tools
│   │   │   │   ├── reservations.ts   # CRUD réservations + actions workflow
│   │   │   │   ├── products.ts       # CRUD produits + pricing
│   │   │   │   ├── customers.ts      # CRUD clients
│   │   │   │   ├── categories.ts     # CRUD catégories
│   │   │   │   ├── payments.ts       # Enregistrement et suivi paiements
│   │   │   │   ├── analytics.ts      # Consultation stats et métriques
│   │   │   │   └── settings.ts       # Configuration boutique
│   │   │   ├── resources/
│   │   │   │   ├── index.ts          # Enregistrement centralisé des resources
│   │   │   │   ├── store.ts          # Infos boutique courante
│   │   │   │   ├── catalog.ts        # Catalogue produits (lecture)
│   │   │   │   └── dashboard.ts      # Métriques dashboard (lecture)
│   │   │   ├── prompts/
│   │   │   │   ├── index.ts          # Enregistrement centralisé des prompts
│   │   │   │   └── templates.ts      # Prompts métier pré-configurés
│   │   │   └── utils/
│   │   │       ├── formatting.ts     # Formatage monétaire, dates, etc.
│   │   │       └── errors.ts         # Mapping erreurs MCP standardisé
│   │   └── bin/
│   │       └── louez-mcp.ts          # CLI entry point (stdio transport)
│   │
│   ├── api/                          # Modifié — services enrichis
│   │   └── src/
│   │       ├── services/             # Couche service partagée (MCP + oRPC + futur REST)
│   │       │   ├── reservations.ts   # CRUD réservations
│   │       │   ├── products.ts       # CRUD produits
│   │       │   ├── customers.ts      # CRUD clients
│   │       │   ├── categories.ts     # CRUD catégories
│   │       │   ├── payments.ts       # Gestion paiements
│   │       │   ├── analytics.ts      # Métriques et stats
│   │       │   ├── api-keys.ts       # NOUVEAU — gestion API keys
│   │       │   └── ...               # Services existants
│   │       └── routers/
│   │           └── dashboard/
│   │               └── api-keys.ts   # NOUVEAU — router oRPC API keys
│   │
│   ├── db/                           # Modifié — ajout table api_keys
│   └── ...
│
├── apps/
│   └── web/
│       └── app/(dashboard)/dashboard/settings/
│           └── api/                  # NOUVEAU — page de gestion API keys
│               ├── page.tsx
│               └── components/
│                   ├── api-keys-page-content.tsx
│                   ├── api-key-card.tsx
│                   ├── create-api-key-dialog.tsx
│                   └── api-key-created-dialog.tsx
```

### 2.3. Dépendances

```json
{
  "name": "@louez/mcp",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./stdio": "./bin/louez-mcp.ts"
  },
  "bin": {
    "louez-mcp": "./bin/louez-mcp.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12",
    "@louez/db": "workspace:*",
    "@louez/api": "workspace:*",
    "@louez/validations": "workspace:*",
    "@louez/utils": "workspace:*",
    "zod": "^3.24"
  },
  "devDependencies": {
    "@louez/config": "workspace:*",
    "typescript": "^5.8"
  }
}
```

### 2.4. Transports supportés

| Transport | Usage | Priorité |
|-----------|-------|----------|
| **stdio** | Usage local avec Claude Desktop, Claude Code, Cursor, etc. | Phase 1 |
| **Streamable HTTP** | Usage remote (déploiement serveur, multi-utilisateur) | Phase 2 |

### 2.5. Diagramme de flux

```
┌──────────────┐     stdio/HTTP      ┌──────────────────┐
│  Client MCP  │ ◄──────────────────► │  @louez/mcp      │
│  (Claude,    │                      │  McpServer        │
│   Cursor,    │                      │                   │
│   etc.)      │                      │  ┌─────────────┐  │
└──────────────┘                      │  │ Auth Layer  │  │
                                      │  │ (API Key →  │  │
                                      │  │  Store ctx) │  │
                                      │  └──────┬──────┘  │
                                      │         │         │
                                      │  ┌──────▼──────┐  │
                                      │  │ Tools /     │  │
                                      │  │ Resources / │  │
                                      │  │ Prompts     │  │
                                      │  └──────┬──────┘  │
                                      │         │         │
                                      └─────────┼─────────┘
                                                │
                                      ┌─────────▼─────────────┐
                                      │ Service Layer          │
                                      │ (packages/api/services)│
                                      └─────────┬─────────────┘
                                                │
                                      ┌─────────▼─────────┐
                                      │   @louez/db        │
                                      │   (Drizzle + MySQL) │
                                      └────────────────────┘
```

---

## 3. Authentification et sécurité

### 3.1. Schéma API Keys

Ajout d'une nouvelle table dans `packages/db/src/schema.ts` :

```typescript
export const apiKeys = mysqlTable(
  'api_keys',
  {
    id: id(),
    storeId: varchar('store_id', { length: 21 }).notNull(),
    userId: varchar('user_id', { length: 21 }).notNull(),

    name: varchar('name', { length: 100 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
    keyHash: varchar('key_hash', { length: 64 }).notNull(),

    permissions: json('permissions').$type<ApiKeyPermissions>().notNull(),

    lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
    expiresAt: timestamp('expires_at', { mode: 'date' }),
    revokedAt: timestamp('revoked_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdx: index('api_keys_store_idx').on(table.storeId),
    prefixIdx: index('api_keys_prefix_idx').on(table.keyPrefix),
  })
)
```

### 3.2. Type de permissions API Key

```typescript
// packages/types/src/api-key.ts
export interface ApiKeyPermissions {
  reservations: 'none' | 'read' | 'write'
  products: 'none' | 'read' | 'write'
  customers: 'none' | 'read' | 'write'
  categories: 'none' | 'read' | 'write'
  payments: 'none' | 'read' | 'write'
  analytics: 'none' | 'read'
  settings: 'none' | 'read' | 'write'
}

export const API_KEY_PERMISSION_DOMAINS = [
  'reservations',
  'products',
  'customers',
  'categories',
  'payments',
  'analytics',
  'settings',
] as const

export type ApiKeyPermissionDomain = (typeof API_KEY_PERMISSION_DOMAINS)[number]

// Presets pour la création rapide
export const API_KEY_PERMISSION_PRESETS = {
  full: {
    reservations: 'write',
    products: 'write',
    customers: 'write',
    categories: 'write',
    payments: 'write',
    analytics: 'read',
    settings: 'write',
  },
  readOnly: {
    reservations: 'read',
    products: 'read',
    customers: 'read',
    categories: 'read',
    payments: 'read',
    analytics: 'read',
    settings: 'read',
  },
  operations: {
    reservations: 'write',
    products: 'read',
    customers: 'write',
    categories: 'read',
    payments: 'write',
    analytics: 'read',
    settings: 'none',
  },
} as const satisfies Record<string, ApiKeyPermissions>
```

### 3.3. Flux d'authentification

```
1. L'utilisateur génère une API key dans le dashboard (Paramètres > API)
2. La clé est affichée UNE SEULE FOIS : "lz_abc12def34..."
3. Le hash SHA-256 est stocké en DB
4. Lors d'une connexion MCP :
   a. La clé est passée via variable d'env (LOUEZ_API_KEY)
   b. Le serveur MCP extrait le prefix, cherche en DB
   c. Vérifie le hash, vérifie non-expiré/non-révoqué
   d. Charge le store + permissions associés
   e. Crée le contexte MCP (storeId, userId, permissions)
```

### 3.4. Isolation multi-tenant

Chaque opération de la session MCP est automatiquement filtrée par `storeId`. Le contexte d'authentification est résolu UNE FOIS à l'initialisation et injecté dans chaque handler de tool/resource :

```typescript
interface McpSessionContext {
  storeId: string
  userId: string
  storeName: string
  permissions: ApiKeyPermissions
  apiKeyId: string
}
```

### 3.5. Garde de permissions

```typescript
function requireMcpPermission(
  ctx: McpSessionContext,
  domain: keyof ApiKeyPermissions,
  level: 'read' | 'write'
): void {
  const perm = ctx.permissions[domain]
  if (perm === 'none') throw new McpPermissionError(domain, level)
  if (level === 'write' && perm === 'read') throw new McpPermissionError(domain, level)
}
```

### 3.6. Format de la clé API

```
Format : lz_{prefix}_{random}
Exemple: lz_a3k9_m2xRtYhN7bPq4cWdEfGj

- Préfixe "lz_" : identification immédiate comme clé Louez
- Segment prefix (4 chars) : lookup rapide en DB + identification visuelle
- Segment random (20 chars) : entropie cryptographique (nanoid)
- Total : ~28 chars, facile à copier, unique, non-devinable
```

---

## 4. Catalogue des Tools (actions)

Les tools sont les capacités d'action du serveur MCP. Ils suivent le pattern CRUD + actions métier.

### 4.1. Réservations (`tools/reservations.ts`)

| Tool | Input | Permission | Description |
|------|-------|------------|-------------|
| `list_reservations` | `{ status?, period?, search?, page?, pageSize? }` | `reservations:read` | Lister les réservations avec filtres |
| `get_reservation` | `{ reservationId }` | `reservations:read` | Détail complet d'une réservation |
| `create_reservation` | `{ customerId?, newCustomer?, startDate, endDate, items[], ... }` | `reservations:write` | Créer une réservation manuelle |
| `update_reservation` | `{ reservationId, startDate?, endDate?, items?[] }` | `reservations:write` | Modifier dates/items d'une réservation |
| `update_reservation_status` | `{ reservationId, status, rejectionReason? }` | `reservations:write` | Confirmer, rejeter, annuler, etc. |
| `update_reservation_notes` | `{ reservationId, notes }` | `reservations:write` | Mettre à jour les notes internes |
| `get_reservation_poll` | `{}` | `reservations:read` | Compteurs rapides (pending, ongoing, etc.) |

### 4.2. Produits (`tools/products.ts`)

| Tool | Input | Permission | Description |
|------|-------|------------|-------------|
| `list_products` | `{ status?, categoryId?, search? }` | `products:read` | Lister les produits |
| `get_product` | `{ productId }` | `products:read` | Détail complet d'un produit |
| `create_product` | `{ name, price, pricingMode, categoryId?, quantity?, ... }` | `products:write` | Créer un produit |
| `update_product` | `{ productId, name?, price?, status?, ... }` | `products:write` | Modifier un produit |
| `archive_product` | `{ productId }` | `products:write` | Archiver un produit |
| `check_availability` | `{ productId, startDate, endDate }` | `products:read` | Vérifier la dispo sur une période |

### 4.3. Clients (`tools/customers.ts`)

| Tool | Input | Permission | Description |
|------|-------|------------|-------------|
| `list_customers` | `{ search?, sort?, type? }` | `customers:read` | Lister les clients |
| `get_customer` | `{ customerId }` | `customers:read` | Détail d'un client avec historique |
| `create_customer` | `{ email, firstName, lastName, phone?, ... }` | `customers:write` | Créer un client |
| `update_customer` | `{ customerId, email?, firstName?, ... }` | `customers:write` | Modifier un client |

### 4.4. Catégories (`tools/categories.ts`)

| Tool | Input | Permission | Description |
|------|-------|------------|-------------|
| `list_categories` | `{}` | `categories:read` | Lister les catégories |
| `create_category` | `{ name, description? }` | `categories:write` | Créer une catégorie |
| `update_category` | `{ categoryId, name?, description? }` | `categories:write` | Modifier une catégorie |
| `delete_category` | `{ categoryId }` | `categories:write` | Supprimer une catégorie |

### 4.5. Paiements (`tools/payments.ts`)

| Tool | Input | Permission | Description |
|------|-------|------------|-------------|
| `list_payments` | `{ reservationId }` | `payments:read` | Paiements d'une réservation |
| `record_payment` | `{ reservationId, type, amount, method, notes? }` | `payments:write` | Enregistrer un paiement |
| `delete_payment` | `{ paymentId }` | `payments:write` | Supprimer un paiement |
| `return_deposit` | `{ reservationId, amount, method, notes? }` | `payments:write` | Rembourser une caution |

### 4.6. Analytics (`tools/analytics.ts`)

| Tool | Input | Permission | Description |
|------|-------|------------|-------------|
| `get_dashboard_stats` | `{ period?: '7d' \| '30d' \| '90d' \| '12m' }` | `analytics:read` | Métriques clés du dashboard |
| `get_revenue_report` | `{ startDate, endDate }` | `analytics:read` | Rapport de revenus sur une période |
| `get_product_performance` | `{ period? }` | `analytics:read` | Performance par produit |

### 4.7. Paramètres boutique (`tools/settings.ts`)

| Tool | Input | Permission | Description |
|------|-------|------------|-------------|
| `get_store_settings` | `{}` | `settings:read` | Configuration complète de la boutique |
| `update_store_info` | `{ name?, email?, phone?, address? }` | `settings:write` | Modifier les infos de la boutique |
| `update_store_legal` | `{ cgv?, legalNotice? }` | `settings:write` | Modifier les mentions légales |

---

## 5. Catalogue des Resources (lecture)

Les resources exposent des données en lecture seule, consultables par le client MCP.

### 5.1. Store (`resources/store.ts`)

| Resource | URI | Description |
|----------|-----|-------------|
| `store-info` | `louez://store/info` | Infos de la boutique (nom, slug, contact, config) |
| `store-settings` | `louez://store/settings` | Configuration complète |
| `store-team` | `louez://store/team` | Membres de l'équipe et rôles |

### 5.2. Catalogue (`resources/catalog.ts`)

| Resource | URI | Description |
|----------|-----|-------------|
| `product-list` | `louez://catalog/products` | Catalogue complet des produits |
| `product-detail` | `louez://catalog/products/{productId}` | Détail d'un produit (resource template) |
| `category-list` | `louez://catalog/categories` | Liste des catégories |

### 5.3. Dashboard (`resources/dashboard.ts`)

| Resource | URI | Description |
|----------|-----|-------------|
| `dashboard-summary` | `louez://dashboard/summary` | Résumé du jour (réservations, revenus) |
| `pending-reservations` | `louez://dashboard/reservations/pending` | Réservations en attente d'action |
| `overdue-returns` | `louez://dashboard/reservations/overdue` | Retours en retard |

---

## 6. Catalogue des Prompts (templates)

| Prompt | Args | Description |
|--------|------|-------------|
| `daily-briefing` | `{}` | Résumé quotidien : réservations du jour, retours attendus, revenus |
| `reservation-summary` | `{ reservationId }` | Synthèse complète d'une réservation avec historique |
| `customer-profile` | `{ customerId }` | Profil client complet avec historique de locations |
| `inventory-check` | `{}` | État du stock : disponibilités, produits les plus loués |
| `revenue-analysis` | `{ period }` | Analyse des revenus sur une période donnée |

---

## 7. Interface utilisateur : Gestion des API Keys

### 7.1. Emplacement dans la navigation

Nouvelle entrée dans le `SettingsNav` :

```typescript
// settings-nav.tsx — ajout entre "Embed Code" et "Admin"
{
  href: '/dashboard/settings/api',
  icon: KeyRound,        // lucide-react
  labelKey: 'api.title', // "API" en fr/en
}
```

### 7.2. Page principale (`/dashboard/settings/api`)

#### Layout de la page

```
┌─────────────────────────────────────────────────────────┐
│  API Keys                                               │
│  Créez des clés pour connecter des outils externes      │
│  à votre boutique.                                      │
│                                                         │
│  [+ Créer une clé API]                          ┌─────┐ │
│                                                 │ Doc │ │
│                                                 └─────┘ │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─── Clé Active ────────────────────────────────────┐  │
│  │ 🔑 Mon intégration MCP               lz_a3k9_... │  │
│  │ Créée le 8 mars 2026 · Dernière utilisation: 2h   │  │
│  │                                                    │  │
│  │ Permissions :                                      │  │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐           │  │
│  │ │ Réserv.  │ │ Produits │ │ Clients  │           │  │
│  │ │ Lecture   │ │ Écriture │ │ Écriture │           │  │
│  │ └──────────┘ └──────────┘ └──────────┘           │  │
│  │                                                    │  │
│  │                              [Révoquer]            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─── Clé Révoquée (grisée) ─────────────────────────┐  │
│  │ 🔑 Ancien webhook              lz_b7m2_... (rev.) │  │
│  │ Créée le 1 janv. 2026 · Révoquée le 5 mars 2026   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Composants

**`api-keys-page-content.tsx`** — Composant client principal

```tsx
'use client'

// Gère la liste des clés via TanStack Query + oRPC
// - useQuery pour la liste
// - useMutation pour création et révocation
// - Dialog pour création
// - Dialog pour affichage unique de la clé créée
```

**`api-key-card.tsx`** — Carte d'une clé API

```tsx
// Affiche une clé API avec :
// - Icône KeyRound
// - Nom de la clé
// - Préfixe tronqué (lz_a3k9_...)
// - Date de création, dernière utilisation (relative via date-fns)
// - Date d'expiration si définie
// - Badges de permissions par domaine
// - Bouton "Révoquer" (avec confirmation AlertDialog)
// - État visuel : active (border normale) / révoquée (opacity-50, barré)
// - Pas de FloatingSaveBar (pas un formulaire)
```

**`create-api-key-dialog.tsx`** — Dialog de création

```
┌──────────────────────────────────────────────────────┐
│  Créer une clé API                              [×]  │
│                                                      │
│  Nom *                                               │
│  ┌────────────────────────────────────────────────┐  │
│  │ Mon intégration MCP                            │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Expiration                                          │
│  ┌──────────────────────────────┐                    │
│  │ Jamais                    ▼  │                    │
│  └──────────────────────────────┘                    │
│  (Jamais / 30 jours / 90 jours / 1 an / Personnalisé)│
│                                                      │
│  ─── Permissions ───────────────────────────────     │
│                                                      │
│  Preset rapide :                                     │
│  (•) Accès complet  ( ) Lecture seule  ( ) Opérations│
│                                                      │
│  Ou personnaliser :                                  │
│  ┌────────────────────┬──────────┬────────┬───────┐  │
│  │ Domaine            │ Aucun    │ Lire   │Écrire │  │
│  ├────────────────────┼──────────┼────────┼───────┤  │
│  │ Réservations       │          │        │  (•)  │  │
│  │ Produits           │          │        │  (•)  │  │
│  │ Clients            │          │        │  (•)  │  │
│  │ Catégories         │          │        │  (•)  │  │
│  │ Paiements          │          │        │  (•)  │  │
│  │ Analytics          │          │  (•)   │       │  │
│  │ Paramètres         │          │        │  (•)  │  │
│  └────────────────────┴──────────┴────────┴───────┘  │
│                                                      │
│  ⚠️ Le rôle maximum est limité à vos propres         │
│    permissions (owner/member).                       │
│                                                      │
│                         [Annuler]  [Créer la clé]    │
└──────────────────────────────────────────────────────┘
```

**`api-key-created-dialog.tsx`** — Dialog de confirmation (post-création)

```
┌──────────────────────────────────────────────────────┐
│  ✓ Clé API créée                                     │
│                                                      │
│  Copiez cette clé maintenant. Elle ne sera plus      │
│  jamais affichée.                                    │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ lz_a3k9_m2xRtYhN7bPq4cWdEfGj         [Copier]│  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ─── Utilisation ───                                 │
│                                                      │
│  Claude Desktop / Claude Code :                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ {                                              │  │
│  │   "mcpServers": {                              │  │
│  │     "louez": {                                 │  │
│  │       "command": "npx",                        │  │
│  │       "args": ["@louez/mcp"],                  │  │
│  │       "env": {                                 │  │
│  │         "LOUEZ_API_KEY": "lz_a3k9_..."         │  │
│  │       }                                        │  │
│  │     }                                          │  │
│  │   }                                            │  │
│  │ }                                       [Copier]│  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│                                      [J'ai compris]  │
└──────────────────────────────────────────────────────┘
```

### 7.3. Patterns UI à respecter

| Pattern | Implémentation |
|---------|----------------|
| **Composants** | `Card`, `CardHeader`, `CardContent`, `Badge`, `Button`, `Dialog`, `Input`, `Select` depuis `@louez/ui` |
| **Data fetching** | TanStack Query + oRPC (`orpc.dashboard.apiKeys.*`) |
| **Mutations** | `useMutation` avec invalidation ciblée |
| **Toasts** | `toastManager.add()` pour succès/erreur |
| **i18n** | Clés sous `dashboard.settings.api.*` |
| **Permissions** | Page visible uniquement pour `manage_settings` |
| **Responsive** | Mobile-first, grid adaptatif |
| **Empty state** | Illustration + CTA quand aucune clé n'existe |
| **Confirmation** | `AlertDialog` avant révocation |
| **Code blocks** | Fond `bg-muted`, police mono, bouton copier |
| **Accessibilité** | Labels sur tous les inputs, focus trap dans les dialogs |

### 7.4. Empty state (quand aucune clé n'existe)

```
┌────────────────────────────────────────────────────┐
│                                                    │
│                    🔑                              │
│                                                    │
│           Aucune clé API                           │
│                                                    │
│   Créez une clé API pour connecter des outils      │
│   comme Claude Desktop, Cursor, ou tout client     │
│   MCP compatible à votre boutique.                 │
│                                                    │
│            [+ Créer une clé API]                   │
│                                                    │
│   📖 Consulter la documentation                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 7.5. Service API Keys (`packages/api/src/services/api-keys.ts`)

```typescript
// Service transport-agnostique — utilisé par oRPC ET (futur) REST

import { createHash, randomBytes } from 'node:crypto'
import { nanoid } from 'nanoid'

export interface CreateApiKeyInput {
  storeId: string
  userId: string
  userRole: MemberRole
  name: string
  permissions: ApiKeyPermissions
  expiresAt?: Date | null
}

export interface CreateApiKeyResult {
  id: string
  rawKey: string         // Retourné UNE SEULE FOIS
  keyPrefix: string
  name: string
  permissions: ApiKeyPermissions
  expiresAt: Date | null
  createdAt: Date
}

export async function createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult>
export async function listApiKeys(storeId: string): Promise<ApiKeySummary[]>
export async function revokeApiKey(storeId: string, keyId: string): Promise<void>
export async function resolveApiKey(rawKey: string): Promise<ResolvedApiKey | null>
```

### 7.6. Router oRPC (`packages/api/src/routers/dashboard/api-keys.ts`)

```typescript
// Mince couche de transport qui appelle les services

export const apiKeysRouter = {
  list: requirePermission('manage_settings')
    .handler(async ({ context }) => {
      return listApiKeys(context.store.id)
    }),

  create: requirePermission('manage_settings')
    .input(createApiKeySchema)
    .handler(async ({ input, context }) => {
      return createApiKey({
        storeId: context.store.id,
        userId: context.session.user.id,
        userRole: context.role,
        ...input,
      })
    }),

  revoke: requirePermission('manage_settings')
    .input(z.object({ keyId: z.string() }))
    .handler(async ({ input, context }) => {
      return revokeApiKey(context.store.id, input.keyId)
    }),
}
```

---

## 8. Architecture REST-ready (décisions structurantes)

Cette section documente les décisions architecturales prises dès maintenant pour faciliter l'ajout futur d'une API REST publique.

### 8.1. Principe : le service ne connaît pas son transport

Chaque service dans `packages/api/src/services/` :

```typescript
// ✅ BON — transport-agnostique
export async function listReservations(input: ListReservationsInput): Promise<ListReservationsResult>

// ❌ MAUVAIS — couplé au transport
export async function listReservations(req: NextRequest): Promise<NextResponse>
export async function listReservations(mcpContext: McpSessionContext): Promise<McpToolResult>
```

### 8.2. Schéma d'erreurs unifié

```typescript
// packages/api/src/services/errors.ts

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export type ServiceErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'

// Chaque transport mappe ces codes vers son propre format :
// - oRPC → ORPCError
// - MCP  → McpError avec code JSON-RPC
// - REST → HTTP status codes (404, 403, 422, 409, 429)
```

### 8.3. Validation d'input partagée

Les schémas Zod sont dans `@louez/validations` et réutilisés par tous les transports :

```typescript
// packages/validations/src/api-keys.ts
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: apiKeyPermissionsSchema,
  expiresAt: z.date().nullable().optional(),
})

// Utilisé par :
// - oRPC : dashboardProcedure.input(createApiKeySchema)
// - MCP  : server.registerTool('create_api_key', { inputSchema: createApiKeySchema })
// - REST : router.post('/api/v1/api-keys', validate(createApiKeySchema))
```

### 8.4. Pagination standardisée

Tous les endpoints de listing utilisent le même contrat :

```typescript
export interface PaginatedInput {
  page?: number     // défaut: 1
  pageSize?: number // défaut: 20, max: 100
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
```

### 8.5. Quand ajouter la REST API ?

La REST API sera pertinente quand :

- Des utilisateurs/partenaires demandent l'accès programmatique (hors IA)
- Un besoin d'intégrations tierces apparaît (channel managers, POS, comptabilité)
- Un écosystème de plugins se développe autour de Louez

Quand ce moment arrive, il suffira de :

1. Ajouter un route handler Next.js `/api/v1/[...path]/route.ts`
2. Parser les API keys depuis le header `Authorization: Bearer lz_...`
3. Mapper les endpoints REST vers les services existants
4. Générer la documentation OpenAPI depuis les schémas Zod
5. Ajouter rate limiting granulaire par clé

L'infrastructure (API keys, permissions, services, validation) sera déjà en place.

---

## 9. Plan de phases

### Phase 1 — Fondations (2-3 jours)

**Objectif** : package fonctionnel avec authentification et service layer.

| Étape | Fichiers | Détail |
|-------|----------|--------|
| 1.1 | `packages/mcp/package.json`, `tsconfig.json` | Scaffolding du package dans le monorepo |
| 1.2 | `packages/db/src/schema.ts` | Ajout de la table `api_keys` + relations |
| 1.3 | `packages/db/src/migrations/` | Migration pour la table `api_keys` |
| 1.4 | `packages/types/src/api-key.ts` | Types `ApiKeyPermissions`, presets, domaines |
| 1.5 | `packages/api/src/services/api-keys.ts` | Service de gestion API keys (create, resolve, revoke) |
| 1.6 | `packages/api/src/services/errors.ts` | Classes d'erreurs service unifiées |
| 1.7 | `packages/mcp/src/auth/` | Module d'authentification par API key |
| 1.8 | `packages/mcp/src/server.ts` | Setup du `McpServer` avec auth middleware |
| 1.9 | `packages/mcp/bin/louez-mcp.ts` | Entrée CLI (stdio transport) |
| 1.10 | `packages/mcp/src/utils/` | Helpers (formatting, errors) |

### Phase 2 — Tools de lecture (1-2 jours)

**Objectif** : toutes les opérations de consultation. Extraction des services depuis le code existant.

| Étape | Fichiers | Détail |
|-------|----------|--------|
| 2.1 | `packages/api/src/services/reservations.ts` | Service listReservations, getReservation, getReservationPoll |
| 2.2 | `packages/api/src/services/products.ts` | Service listProducts, getProduct, checkAvailability |
| 2.3 | `packages/api/src/services/customers.ts` | Service listCustomers, getCustomer |
| 2.4 | `packages/api/src/services/analytics.ts` | Service getDashboardStats, getRevenueReport |
| 2.5 | `packages/mcp/src/tools/reservations.ts` | Tools MCP de lecture réservations |
| 2.6 | `packages/mcp/src/tools/products.ts` | Tools MCP de lecture produits |
| 2.7 | `packages/mcp/src/tools/customers.ts` | Tools MCP de lecture clients |
| 2.8 | `packages/mcp/src/tools/categories.ts` | Tool MCP list_categories |
| 2.9 | `packages/mcp/src/tools/analytics.ts` | Tools MCP analytics |
| 2.10 | `packages/mcp/src/tools/settings.ts` | Tool MCP get_store_settings |

### Phase 3 — Tools d'écriture (2-3 jours)

**Objectif** : toutes les opérations de mutation.

| Étape | Fichiers | Détail |
|-------|----------|--------|
| 3.1 | Services + `tools/products.ts` | create_product, update_product, archive_product |
| 3.2 | Services + `tools/customers.ts` | create_customer, update_customer |
| 3.3 | Services + `tools/categories.ts` | create_category, update_category, delete_category |
| 3.4 | Services + `tools/reservations.ts` | create_reservation, update_reservation, update_status, update_notes |
| 3.5 | Services + `tools/payments.ts` | record_payment, delete_payment, return_deposit |
| 3.6 | Services + `tools/settings.ts` | update_store_info, update_store_legal |

### Phase 4 — Resources et Prompts (1 jour)

**Objectif** : compléter l'expérience avec les resources et prompts métier.

| Étape | Fichiers | Détail |
|-------|----------|--------|
| 4.1 | `resources/store.ts` | Resources boutique |
| 4.2 | `resources/catalog.ts` | Resources catalogue (avec resource templates) |
| 4.3 | `resources/dashboard.ts` | Resources dashboard temps réel |
| 4.4 | `prompts/templates.ts` | 5 prompts métier pré-configurés |

### Phase 5 — UI Dashboard API Keys (2-3 jours)

**Objectif** : interface complète de gestion des API keys.

| Étape | Fichiers | Détail |
|-------|----------|--------|
| 5.1 | `packages/api/src/routers/dashboard/api-keys.ts` | Router oRPC (list, create, revoke) |
| 5.2 | `packages/api/src/routers/dashboard/index.ts` | Ajout du router api-keys au dashboard router |
| 5.3 | `apps/web/components/dashboard/settings-nav.tsx` | Ajout entrée "API" dans la navigation |
| 5.4 | `apps/web/app/.../settings/api/page.tsx` | Page serveur (auth + store check) |
| 5.5 | `apps/web/app/.../settings/api/components/api-keys-page-content.tsx` | Composant client principal |
| 5.6 | `apps/web/app/.../settings/api/components/api-key-card.tsx` | Carte d'une clé API |
| 5.7 | `apps/web/app/.../settings/api/components/create-api-key-dialog.tsx` | Dialog de création avec presets |
| 5.8 | `apps/web/app/.../settings/api/components/api-key-created-dialog.tsx` | Dialog de copie sécurisée |
| 5.9 | `apps/web/messages/fr.json`, `en.json` | Traductions pour la section API |
| 5.10 | `packages/validations/src/api-keys.ts` | Schémas Zod de validation |

### Phase 6 — Transport HTTP + Documentation (1-2 jours)

**Objectif** : déploiement remote et documentation.

| Étape | Fichiers | Détail |
|-------|----------|--------|
| 6.1 | `apps/web/app/api/mcp/` | Route handler Next.js pour Streamable HTTP transport |
| 6.2 | `packages/mcp/src/transports/` | Configuration transport HTTP |
| 6.3 | `packages/mcp/README.md` | Documentation complète du package |
| 6.4 | `docs/mcp-guide.md` | Guide utilisateur avec exemples |

---

## 10. Exemples de code

### 10.1. Setup du serveur (`server.ts`)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveApiKey } from './auth/api-keys'
import { registerAllTools } from './tools'
import { registerAllResources } from './resources'
import { registerAllPrompts } from './prompts'
import type { McpSessionContext } from './auth/context'

export async function createMcpServer(apiKey: string): Promise<{
  server: McpServer
  context: McpSessionContext
}> {
  const context = await resolveApiKey(apiKey)

  const server = new McpServer({
    name: `louez-${context.storeName}`,
    version: '0.1.0',
  })

  registerAllTools(server, context)
  registerAllResources(server, context)
  registerAllPrompts(server, context)

  return { server, context }
}
```

### 10.2. Tool réutilisant le service layer (`tools/reservations.ts`)

```typescript
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listReservations } from '@louez/api/services/reservations'
import type { McpSessionContext } from '../auth/context'
import { requireMcpPermission } from '../auth/context'
import { formatReservationList } from '../utils/formatting'

export function registerReservationTools(server: McpServer, ctx: McpSessionContext) {
  server.registerTool(
    'list_reservations',
    {
      title: 'List reservations',
      description: 'List store reservations with optional filters',
      inputSchema: z.object({
        status: z.enum([
          'pending', 'confirmed', 'ongoing',
          'completed', 'cancelled', 'rejected',
        ]).optional(),
        search: z.string().optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    },
    async (input) => {
      requireMcpPermission(ctx, 'reservations', 'read')

      // Appel au service partagé — même code que oRPC et futur REST
      const results = await listReservations({
        storeId: ctx.storeId,
        ...input,
      })

      return {
        content: [{
          type: 'text',
          text: formatReservationList(results),
        }],
      }
    },
  )
}
```

### 10.3. Entrée CLI (`bin/louez-mcp.ts`)

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from '../src/server'

const apiKey = process.env.LOUEZ_API_KEY
if (!apiKey) {
  console.error('LOUEZ_API_KEY environment variable is required')
  process.exit(1)
}

const { server } = await createMcpServer(apiKey)
const transport = new StdioServerTransport()
await server.connect(transport)
```

### 10.4. Configuration Claude Desktop

```json
{
  "mcpServers": {
    "louez": {
      "command": "npx",
      "args": ["@louez/mcp"],
      "env": {
        "LOUEZ_API_KEY": "lz_a3k9_m2xRtYhN7bPq4cWdEfGj",
        "DATABASE_URL": "mysql://..."
      }
    }
  }
}
```

---

## 11. Considérations de sécurité

### 11.1. Menaces et mitigations

| Menace | Mitigation |
|--------|------------|
| Fuite de clé API | Hash SHA-256 en DB, clé affichée une seule fois, révocation instantanée |
| Accès cross-tenant | Toutes les requêtes filtrées par `storeId` du contexte (jamais user-supplied) |
| Escalade de permissions | Intersection avec le rôle du créateur + vérification granulaire par domaine |
| Injection SQL | Utilisation exclusive de Drizzle ORM (paramétrisé) |
| Abus / rate-limiting | Mise à jour `lastUsedAt` à chaque requête, monitoring possible |
| Clé expirée | Vérification `expiresAt` à chaque requête, rejet si expirée |

### 11.2. Bonnes pratiques

- Les API keys ne sont **jamais** loguées ni retournées en clair après création
- Le `keyPrefix` sert uniquement à l'identification visuelle
- Les permissions de l'API key sont **intersectées** avec le rôle de l'utilisateur créateur
- Les tools d'écriture sensibles exigent `write` sur le domaine
- Les erreurs de service ne leakent jamais de détails internes

---

## 12. Conventions de code

| Convention | Application |
|------------|-------------|
| **IDs** | nanoid 21 chars |
| **Montants** | `DECIMAL(10,2)`, toujours en string dans Drizzle |
| **Validation** | Zod, schémas partagés dans `@louez/validations` |
| **Services** | Fonctions pures, transport-agnostique, dans `packages/api/src/services/` |
| **Erreurs** | `ServiceError` dans les services, mappé par chaque transport |
| **Multi-tenant** | `storeId` en filtre systématique |
| **TypeScript** | Strict mode, pas de `any` |
| **Nommage tools** | `snake_case` (convention MCP) |
| **i18n UI** | Clés sous `dashboard.settings.api.*` |
| **Composants** | shadcn/ui depuis `@louez/ui`, patterns TanStack Query |

---

## 13. Réutilisation du code existant

| Couche existante | Réutilisation |
|------------------|---------------|
| `@louez/db` (schéma + requêtes) | Accès direct à la DB via Drizzle pour les queries |
| `packages/api/src/services/*` | Services métier partagés entre oRPC, MCP, et futur REST |
| `@louez/validations` | Schémas Zod existants pour la validation d'input |
| `@louez/utils` | Helpers pricing, permissions, formatage |
| `@louez/types` | Types partagés (StoreSettings, ApiKeyPermissions, etc.) |
| Integration registry | Possible intégration future MCP comme provider dans le hub |

### Services existants réutilisables immédiatement

- `services/availability.ts` → vérification de disponibilité produit
- `services/reservations-dashboard.ts` → listing et détail réservations
- `services/reservation-poll.ts` → compteurs rapides
- `services/store-settings.ts` → mise à jour paramètres boutique
- `services/address.ts` → résolution d'adresses

---

## 14. Tests

### Stratégie de test

| Type | Outil | Couverture |
|------|-------|------------|
| **Unitaire** | Vitest | Auth, formatting, permission guards, service errors |
| **Intégration** | Vitest + MCP Inspector | Chaque tool end-to-end avec DB de test |
| **Manuel** | Claude Desktop | Scénarios métier complets |

### Scénarios de test critiques

1. **Auth** : clé invalide → rejet, clé expirée → rejet, clé révoquée → rejet
2. **Permissions** : read-only key ne peut pas écrire, permissions granulaires respectées
3. **Multi-tenant** : un tool ne peut jamais accéder aux données d'un autre store
4. **Service layer** : même résultat qu'il soit appelé via oRPC ou MCP
5. **CRUD complet** : créer un produit → le lister → le modifier → l'archiver
6. **Workflow réservation** : créer → confirmer → en cours → complété
7. **API Keys UI** : créer → copier → lister → révoquer → vérifier révoquée

---

## 15. Documentation

### 15.1. README du package (`packages/mcp/README.md`)

- Installation et configuration
- Génération d'API key
- Configuration Claude Desktop / Cursor / Claude Code
- Liste complète des tools avec exemples
- Guide de contribution

### 15.2. Guide utilisateur dans `docs/`

- `docs/mcp-guide.md` : guide d'utilisation pour les loueurs
- Exemples de conversations type
- FAQ

---

## 16. Résumé des fichiers à créer/modifier

### Nouveaux fichiers (~30 fichiers)

```
# Package MCP
packages/mcp/package.json
packages/mcp/tsconfig.json
packages/mcp/src/index.ts
packages/mcp/src/server.ts
packages/mcp/src/auth/api-keys.ts
packages/mcp/src/auth/context.ts
packages/mcp/src/tools/index.ts
packages/mcp/src/tools/reservations.ts
packages/mcp/src/tools/products.ts
packages/mcp/src/tools/customers.ts
packages/mcp/src/tools/categories.ts
packages/mcp/src/tools/payments.ts
packages/mcp/src/tools/analytics.ts
packages/mcp/src/tools/settings.ts
packages/mcp/src/resources/index.ts
packages/mcp/src/resources/store.ts
packages/mcp/src/resources/catalog.ts
packages/mcp/src/resources/dashboard.ts
packages/mcp/src/prompts/index.ts
packages/mcp/src/prompts/templates.ts
packages/mcp/src/utils/formatting.ts
packages/mcp/src/utils/errors.ts
packages/mcp/bin/louez-mcp.ts

# Services partagés (nouveaux)
packages/api/src/services/api-keys.ts
packages/api/src/services/errors.ts

# Types et validation
packages/types/src/api-key.ts
packages/validations/src/api-keys.ts

# Router oRPC
packages/api/src/routers/dashboard/api-keys.ts

# UI Dashboard API Keys
apps/web/app/(dashboard)/dashboard/settings/api/page.tsx
apps/web/app/(dashboard)/dashboard/settings/api/components/api-keys-page-content.tsx
apps/web/app/(dashboard)/dashboard/settings/api/components/api-key-card.tsx
apps/web/app/(dashboard)/dashboard/settings/api/components/create-api-key-dialog.tsx
apps/web/app/(dashboard)/dashboard/settings/api/components/api-key-created-dialog.tsx
```

### Fichiers modifiés (~8 fichiers)

```
packages/db/src/schema.ts                              # Ajout table api_keys
packages/types/src/index.ts                            # Export ApiKeyPermissions
packages/api/src/routers/dashboard/index.ts            # Ajout router api-keys
apps/web/components/dashboard/settings-nav.tsx         # Ajout entrée "API"
apps/web/messages/fr.json                              # Traductions section API
apps/web/messages/en.json                              # Traductions section API
turbo.json                                             # Ajout tasks pour @louez/mcp
pnpm-workspace.yaml                                   # (déjà couvert par packages/*)
```
