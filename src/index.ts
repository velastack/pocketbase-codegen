import { type CollectionField } from 'pocketbase-sveltekit';

/**
 * The minimum a client must provide to read a schema.
 *
 * Structural rather than a concrete PocketBase class so callers can pass a
 * client from `pocketbase` or `pocketbase-sveltekit` — the SvelteKit build
 * differs only in its auth store, which is irrelevant here.
 */
export type SchemaSource = {
	collections: { getFullList: (...args: any[]) => Promise<any[]> };
};
import { Project, StructureKind } from 'ts-morph';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** The module the generated `$types.d.ts` augments. */
export const DEFAULT_MODULE_NAME = '@velastack/pocketbase';

export type EmitOptions = {
	/**
	 * Module specifier to augment and to import the collection-model types from.
	 * Defaults to `@velastack/pocketbase`; a different bindings package (say a
	 * Postgres one) can pass its own name.
	 */
	moduleName?: string;
};

export type Field = CollectionField & {
	maxSelect?: number;
	type: FieldType;
};

export type Collection = {
	id: string;
	name: string;
	type: 'auth' | 'base' | 'view';
	fields: Array<Field>;
};

const validTypes = [
	'text',
	'number',
	'bool',
	'date',
	'email',
	'password',
	'url',
	'editor',
	'autodate',
	'select',
	'file',
	'json',
	'geoPoint',
	'relation'
] as const;

export type FieldType = (typeof validTypes)[number];

function fieldToTsType(
	type: FieldType,
	values: string[] | undefined,
	maxSelect?: number,
	isSchema: boolean = false
): string {
	const valueString = values ? `${values.map((v) => `"${v}"`).join(' | ')}` : '';

	switch (type) {
		case 'text':
		case 'email':
		case 'url':
		case 'editor':
		case 'autodate':
		case 'date':
		case 'password':
			return 'string';
		case 'number':
			return 'number';
		case 'bool':
			return 'boolean';
		case 'json':
			return 'any';
		case 'select':
			return maxSelect && maxSelect > 1 ? `Array<${valueString}>` : valueString;
		case 'file':
			return maxSelect && maxSelect > 1 ? 'string[]' : isSchema ? 'string | File' : 'string';
		case 'relation':
			return maxSelect && maxSelect > 1 ? 'string[]' : 'string';
		case 'fileadd' as 'file':
			return 'File[]';
		case 'fileremove' as 'file':
			return 'string[]';
		case 'geoPoint':
			return '{ lat: number; lon: number }';
		default: {
			const _exhaustiveCheck: never = type;
			return _exhaustiveCheck;
		}
	}
}

function modelForType(type: 'auth' | 'base' | 'view'): string {
	switch (type) {
		case 'auth':
			return 'AuthCollectionModel';
		case 'base':
			return 'BaseCollectionModel';
		case 'view':
			return 'ViewCollectionModel';
	}
}

// Helper function to escape field names when they need to be quoted as object keys
const escapeFieldName = (fieldName: string): string => {
	// Check if the field name is a valid JavaScript identifier
	// Valid identifiers start with letter/underscore/$ and contain only alphanumeric/underscore/$
	const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

	// If it's not a valid identifier, wrap it in quotes
	if (!validIdentifierRegex.test(fieldName)) {
		return `'${fieldName}'`;
	}

	return fieldName;
};

export function collectionsToTypes(collections: Collection[], options: EmitOptions = {}) {
	const moduleName = options.moduleName ?? DEFAULT_MODULE_NAME;
	const tablesTypeBody = collections
		.filter((collection) => !collection.name.startsWith('_'))
		.map((c) => {
			const fields = c.fields
				.map(
					(f) =>
						`${escapeFieldName(f.name)}${f.required ? '' : '?'}: ${fieldToTsType(f.type, f.values, f.maxSelect, false)}`
				)
				.join(';\n');

			if (c.fields.some((f) => f.type === 'relation')) {
				const expandableFields = c.fields
					.filter((f) => f.type === 'relation')
					.map((f) => {
						// Generate fields for the relation, look up collection by id
						const relationCollection = collections.find((c) => c.id === f.collectionId);
						if (!relationCollection) {
							throw new Error(`Relation collection ${f.collectionId} not found`);
						}

						const relationFields = relationCollection.fields
							.map((f) => `${f.name}: ${fieldToTsType(f.type, f.values, f.maxSelect, false)}`)
							.join(';\n');

						return `${f.name}: { ${relationFields} }${f.maxSelect !== 1 ? '[]' : ''};`;
					})
					.join('\n');

				return `${c.name}: {\n${fields},\ncollectionId: "${c.id}";\ncollectionName: "${c.name}";\nexpand?: { ${expandableFields}\n[key: string]: any; };};`;
			}

			return `${c.name}: {\n${fields},\ncollectionId: "${c.id}";\ncollectionName: "${c.name}";\n};`;
		})
		.join('\n');

	const schemasTypeBody = collections
		.filter((collection) => !collection.name.startsWith('_'))
		.map((c) => {
			const allFields: Field[] = [];
			for (const field of c.fields) {
				if (field.name === 'id') {
					allFields.push({
						...field,
						required: false
					});
				} else if (field.type === 'geoPoint') {
					allFields.push({
						...field,
						type: 'text'
					});
				} else {
					allFields.push(field);
				}

				if (field.type === 'file' && field.maxSelect && field.maxSelect > 1) {
					allFields.push({
						name: `${field.name}+`,
						type: 'fileadd' as 'file',
						required: false,
						maxSelect: 99,
						values: [],
						system: false,
						hidden: false,
						presentable: false,
						id: ''
					});
					allFields.push({
						name: `${field.name}-`,
						type: 'fileremove' as 'file',
						required: false,
						maxSelect: 99,
						values: [],
						system: false,
						hidden: false,
						presentable: false,
						id: ''
					});
				}
			}

			const fields = allFields
				.map(
					(f) =>
						`${escapeFieldName(f.name)}${f.required ? '' : '?'}: ${fieldToTsType(f.type, f.values, f.maxSelect, true)}`
				)
				.join(';\n');

			return `${c.name}: z.ZodType<{\n${fields},\ncollectionId?: string;\n}>;`;
		})
		.join('\n');

	const collectionsTypeBody = collections
		.filter((collection) => !collection.name.startsWith('_'))
		.map((c) => `${c.name}: ${modelForType(c.type)};`)
		.join('\n');

	const project = new Project();
	const file = project.createSourceFile('.svelte-kit/types/pocketbase/$types.d.ts', '', {
		overwrite: true
	});

	file.addImportDeclaration({
		kind: StructureKind.ImportDeclaration,
		moduleSpecifier: moduleName,
		namedImports: ['AuthCollectionModel', 'BaseCollectionModel', 'ViewCollectionModel']
	});

	file.addImportDeclaration({
		kind: StructureKind.ImportDeclaration,
		moduleSpecifier: 'zod',
		defaultImport: 'z'
	});

	file.addModule({
		name: JSON.stringify(moduleName),
		hasDeclareKeyword: true,
		statements: [
			{
				kind: StructureKind.TypeAlias,
				name: 'Models',
				isExported: true,
				type: `{\n${tablesTypeBody}\n}`
			},
			{
				kind: StructureKind.TypeAlias,
				name: 'Collections',
				isExported: true,
				type: `{\n${collectionsTypeBody}\n}`
			},
			{
				kind: StructureKind.TypeAlias,
				name: 'Schemas',
				isExported: true,
				type: `{\n${schemasTypeBody}\n}`
			}
		]
	});

	file.formatText();
	return file.getFullText();
}

export type JsonSchema = {
	type: 'object';
	properties: Record<string, unknown>;
	required: string[];
	additionalProperties: false;
};

function fieldToJsonSchema(field: Field): unknown | null {
	const multi = field.maxSelect !== undefined && field.maxSelect > 1;
	switch (field.type) {
		case 'text':
		case 'editor':
		case 'password':
			return { type: 'string' };
		case 'email':
			return { type: 'string', format: 'email' };
		case 'url':
			return { type: 'string', format: 'uri' };
		case 'date':
		case 'autodate':
			return { type: 'string', format: 'date-time' };
		case 'number':
			return { type: 'number' };
		case 'bool':
			return { type: 'boolean' };
		case 'select': {
			const item = { type: 'string', enum: field.values ?? [] };
			return multi ? { type: 'array', items: item, maxItems: field.maxSelect } : item;
		}
		case 'file':
			return multi
				? { type: 'array', items: { type: 'string' }, maxItems: field.maxSelect }
				: { type: 'string' };
		case 'relation':
			return multi
				? { type: 'array', items: { type: 'string' }, maxItems: field.maxSelect }
				: { type: 'string' };
		case 'json':
			return {};
		case 'geoPoint':
			return {
				type: 'object',
				properties: {
					lat: { type: 'number', minimum: -90, maximum: 90 },
					lon: { type: 'number', minimum: -180, maximum: 180 }
				},
				required: ['lat', 'lon']
			};
		default:
			return null;
	}
}

export function collectionToJsonSchema(collection: Collection): JsonSchema {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	for (const field of collection.fields) {
		const schema = fieldToJsonSchema(field);
		if (schema === null) continue;
		properties[field.name] = schema;
		if (field.required) required.push(field.name);
	}

	return { type: 'object', properties, required, additionalProperties: false };
}

/**
 * Read the live schema from an authenticated PocketBase client.
 *
 * The client is injected rather than constructed here so this package stays
 * free of process-spawning dependencies — the caller (`vela`) already owns a
 * `withPocketbase` helper for the throwaway-server case.
 */
export const getCollections = async (pb: SchemaSource): Promise<Collection[]> => {
	const fullList = await pb.collections.getFullList();

	return fullList.map((collection: any) => ({
		id: collection.id,
		name: collection.name,
		type: collection.type,
		fields: collection.fields as Array<
			CollectionField & { maxSelect?: number; required: boolean; type: FieldType }
		>
	}));
};

/**
 * Regenerate `<typesDir>/pocketbase/$types.d.ts` from the live schema.
 *
 * The file is written to a temporary path and renamed into place, so a
 * watcher (or a TypeScript server) never observes a half-written file.
 */
export const processTypes = async (
	pb: SchemaSource,
	typesDir: string,
	options: EmitOptions = {}
): Promise<string> => {
	const pocketbaseDir = resolve(typesDir, 'pocketbase');
	const outputFile = join(pocketbaseDir, '$types.d.ts');

	await mkdir(pocketbaseDir, { recursive: true });

	const collections = await getCollections(pb);
	const types = collectionsToTypes(collections, options);

	const tmp = `${outputFile}.${process.pid}.tmp`;
	await writeFile(tmp, types, 'utf8');
	await rename(tmp, outputFile);

	return outputFile;
};
