const svelte = require('rollup-plugin-svelte');
const typescript = require('@rollup/plugin-typescript');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const postcss = require('rollup-plugin-postcss');
const { string } = require('rollup-plugin-string');

/** @type {import('rollup').RollupOptions[]} */
module.exports = {
    input: 'script/src/main.ts',
    output: {
        file: 'dist/script.js',
        format: 'umd',
        sourcemap: true
    },
    plugins: [
        string({
            include: 'src/templates/**' // 这里可以根据需要指定包含或排除的文件
        }),
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
