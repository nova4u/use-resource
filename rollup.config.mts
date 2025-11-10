import resolve from '@rollup/plugin-node-resolve';
import type { RollupOptions } from 'rollup';
import typescript from 'rollup-plugin-typescript2';

const createConfig = (input: string, output: string): RollupOptions => ({
  input,
  output: [
    {
      file: `dist/${output}.js`,
      format: 'esm',
      sourcemap: true,
    },
  ],
  plugins: [
    resolve(),
    typescript({
      useTsconfigDeclarationDir: true,
      tsconfigOverride: {
        compilerOptions: {
          declaration: true,
          declarationDir: './dist',
        },
      },
    }),
  ],
  external: ['react', 'react-dom', 'react/jsx-runtime'],
});

export default [createConfig('src/index.ts', 'index')];
