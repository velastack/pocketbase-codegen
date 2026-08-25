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

### API

| export                                      | purpose                                                    |
| ------------------------------------------- | ---------------------------------------------------------- |
| `processTypes(pb, typesDir, options?)`      | Generate and write `$types.d.ts`; returns the path written |
| `getCollections(pb)`                        | Read the live schema as `Collection[]`                     |
| `collectionsToTypes(collections, options?)` | Pure: collections → declaration-file source                |
| `collectionToJsonSchema(collection)`        | Pure: one collection → a mutable JSON Schema               |
| `DEFAULT_MODULE_NAME`                       | `'@velastack/pocketbase'`                                  |

`options.moduleName` controls which module the generated file augments and
imports its collection-model types from. It defaults to
`@velastack/pocketbase`; another bindings package can pass its own name.

## License

MIT
