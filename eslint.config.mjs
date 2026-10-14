import next from 'eslint-config-next';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  ...next,
];

export default config;
