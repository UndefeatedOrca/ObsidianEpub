import esbuild from 'esbuild';
const options = { entryPoints: ['src/main.ts'], bundle: true, external: ['obsidian', 'child_process', 'fs/promises', 'os', 'path'], format: 'cjs', target: 'es2020', outfile: 'main.js', logLevel: 'info', minify: !process.argv.includes('--watch') };
if (process.argv.includes('--watch')) { const ctx = await esbuild.context(options); await ctx.watch(); }
else await esbuild.build(options);
