const typescript = require('@rollup/plugin-typescript');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const { default: dts } = require('rollup-plugin-dts');
const { rimrafSync } = require('rimraf');

function cleanDtsPlugin() {
    return {
        name: 'clean-dts',
        buildEnd: async () => {
            rimrafSync('dist/dist-types');
        }
    };
}

/** @type {import('rollup').RollupOptions[]} */
module.exports = [
    {
        input: 'src/program/script.ts',
        output: {
            file: 'dist/script.js',
            format: 'umd',
            sourcemap: true
        },
        plugins: [
            typescript(), // 使用 TypeScript 插件
            resolve(), // 帮助定位第三方模块
            commonjs() // 将 CommonJS 转换为 ES6
        ]
    },
    {
        input: 'src/index.ts',
        output: {
            file: 'dist/index.js',
            format: 'cjs',
            sourcemap: true
        },
        plugins: [
            typescript(), // 使用 TypeScript 插件
            resolve(), // 帮助定位第三方模块
            commonjs() // 将 CommonJS 转换为 ES6
        ]
    },
    {
        input: 'dist/dist-types/index.d.ts',
        output: {
            file: 'dist/index.d.ts',
            format: 'es'
        },
        plugins: [dts(), cleanDtsPlugin()],
        treeshake: true
    }
];
