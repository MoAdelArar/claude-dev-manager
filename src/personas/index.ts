/**
 * Personas module - Dynamic persona system for CDM.
 */

export * from './types';
export { PersonaCatalog, getCatalogIndexPath, loadOrBuildCatalog } from './catalog';
export { PersonaFetcher, createPersonaFetcher, type FetchResult } from './fetcher';
export { PersonaResolver, createPersonaResolver, type ResolverOptions } from './resolver';
export { PromptComposer, createPromptComposer, type ComposerContext } from './composer';
