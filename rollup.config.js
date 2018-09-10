import typescript from 'rollup-plugin-typescript2';

export default [{
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'cjs',
  },
  plugins: [
    typescript({
      rollupCommonJSResolveHack: true
    })
  ]
}, {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.esm.js',
    format: 'es',
  },
  plugins: [
    typescript({
      rollupCommonJSResolveHack: true
    })
  ]
}]
