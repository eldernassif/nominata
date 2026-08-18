import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem `globals`, o auto-cleanup do Testing Library não é registrado sozinho.
afterEach(() => {
  cleanup();
});
