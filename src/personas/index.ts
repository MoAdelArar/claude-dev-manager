/**
 * Personas module - Dynamic persona system for CDM.
 */

export * from './types.js';
export { PersonaCatalog, getCatalogIndexPath, loadOrBuildCatalog } from './catalog.js';
export { PersonaFetcher, createPersonaFetcher, type FetchResult } from './fetcher.js';
export { PersonaResolver, createPersonaResolver, type ResolverOptions } from './resolver.js';
export { PromptComposer, createPromptComposer, type ComposerContext } from './composer.js';
