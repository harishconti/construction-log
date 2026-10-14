'use client';

import { createAuthClient } from '@neondatabase/auth/next';

/**
 * Browser auth client. Takes no arguments — it talks to the same-origin
 * proxy mounted at /api/auth/[...path].
 */
export const authClient = createAuthClient();
