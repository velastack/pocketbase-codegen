# @velastack/pocketbase-codegen

Generates TypeScript types and JSON Schema from a live PocketBase schema.

This is **dev-time tooling**. It is never loaded in a request path — it depends
on `ts-morph`, which bundles the entire TypeScript compiler.

```sh
npm install -D @velastack/pocketbase-codegen
```

## Usage

The PocketBase client is injected, so this package does no connecting,
authenticating, or process spawning of its own:

```ts
import { processTypes } from '@velastack/pocketbase-codegen';

await processTypes(pb, '.svelte-kit/types');
```

That writes `.svelte-kit/types/pocketbase/$types.d.ts`, which augments
`@velastack/pocketbase` with `Models`, `Collections`, and `Schemas` for the
project's collections. The file is written to a temporary path and renamed into
place, so a watcher never sees a partial file.

### `Models` and `Schemas`

`Models` is what PocketBase returns, `Schemas` is what it accepts, and the two
treat a non-required field differently:

```ts
// a `songs` collection: title (required), artist, year, genre (single select)
Models['songs']; //  { id: string; title: string; artist: string; year: number; genre: 'rock' | 'pop' | ''; ... }
Schemas['songs']; // z.ZodType<{ id?: string; title: string; artist?: string; year?: number; genre?: 'rock' | 'pop'; ... }>
```

A record always comes back with every field filled in. An unset one holds its
zero value (`''`, `0`, `false`, `[]`, `null` for json; `''` too for an unset
date, file, single relation or single select), so `Models` fields are not
optional and need no `?? ''`. The exceptions are fields the response can leave
out: `hidden` fields such as `password` and `tokenKey`, which only superusers
are sent, and a non-required `email` on an auth collection. A required auth
`email` (PocketBase's default) is typed as present because the signed-in
user's own record always has it, but another user's record arrives without it
unless that record's `emailVisibility` is on. Entries under `expand` follow
the same rules.

Before 0.2.0 every non-required field in `Models` was optional
(`artist?: string`), a single select had no `''` in its union, and a required
hidden field was typed as always present.

### API

| export                                      | purpose                                                    |
| ------------------------------------------- | ---------------------------------------------------------- |
| `processTypes(pb, typesDir, options?)`      | Generate and write `$types.d.ts`; returns the path written |
| `getCollections(pb)`                        | Read the live schema as `Collection[]`                     |
| `collectionsToTypes(collections, options?)` | Pure: collections → declaration-file source                |
| `collectionToJsonSchema(collection)`        | Pure: one collection → a mutable JSON Schema               |
| `DEFAULT_MODULE_NAME`                       | `'@velastack/pocketbase'`                                  |

`collectionToJsonSchema` carries a field's own limits into the schema: a number
field's `onlyInt` becomes `type: 'integer'` and its `min` / `max` become
`minimum` / `maximum`; a text field's `min` / `max` / `pattern` become
`minLength` / `maxLength` / `pattern`. A keyword is only emitted for an option
that is set (a text field's `max: 0` is PocketBase's default limit, not a
limit of zero), and a pattern that is not also a valid JavaScript regular
expression is left out.

`options.moduleName` controls which module the generated file augments and
imports its collection-model types from. It defaults to
`@velastack/pocketbase`; another bindings package can pass its own name.

## License

MIT
