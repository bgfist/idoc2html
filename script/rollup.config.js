const svelte = require('rollup-plugin-svelte');
const typescript = require('@rollup/plugin-typescript');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const postcss = require('rollup-plugin-postcss');

/** @type {import('rollup').RollupOptions[]} */
module.exports = {
    input: 'script/main.ts',
    output: {
        file: 'dist/script.js',
        format: 'umd',
        sourcemap: true
    },
    plugins: [
        svelte({
            preprocess: require('svelte-preprocess')()
        }),
        postcss(),
        typescript(),
        resolve({
            browser: true,
            dedupe: ['svelte']
        }),
        commonjs()
    ],
    watch: {
        clearScreen: false
    }
};
