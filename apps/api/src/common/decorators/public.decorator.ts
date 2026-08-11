import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as not requiring authentication. Used sparingly (auth, health)
 * since the global guard otherwise requires a valid JWT on every request.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
