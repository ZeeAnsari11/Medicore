/** Escapes user input for safe use inside a Mongo $regex. */
export const escapeRegex = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
