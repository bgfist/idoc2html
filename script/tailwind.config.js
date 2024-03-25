const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [path.join(__dirname, '**/*.{html,svelte}')],
    theme: {
        spacing: {
            ...generateNumUnits(0, 800)
        },
        extend: {
            borderRadius: generateNumUnits(1, 30),
            backgroundSize: {
                '100%': '100% 100%',
                'fit-w': '100% auto',
                'fit-h': 'auto 100%'
            },
            zIndex: {
                1: '1',
                2: '2',
                3: '3',
                4: '4',
                5: '5',
                6: '6',
                7: '7',
                8: '8',
                9: '9'
            }
        },
        fontSize: generateNumUnits(6, 80, 1),
        lineHeight: generateNumUnits(10, 120),
        colors: {
            main: 'hsla(222, 9%, 23%, 1)',
            white: 'hsla(0, 0%, 100%, 1)',
            gray: {
                20: 'hsla(0, 0%, 20%, 1)',
                27: 'hsla(0, 0%, 27%, 1)',
                40: 'hsla(0, 0%, 40%, 1)',
                58: 'hsla(0, 0%, 58%, 1)',
                60: 'hsla(0, 0%, 60%, 1)',
                63: 'hsla(0, 0%, 63%, 1)',
                80: 'hsla(0, 0%, 80%, 1)',
                90: 'hsla(0, 0%, 90%, 1)',
                95: 'hsla(0, 0%, 95%, 1)',
                100: 'hsla(0, 0%, 100%, 1)',
                dialog: 'hsla(0, 0%, 0%, 0.6)'
            }
        }
    }
};

/**
 * @params {number} from
 * @params {number} to
 * @returns {Record<string, string>}
 */
function generateNumUnits(from, to, step = 1) {
    /** @type {any} */
    const ret = {};
    for (let i = from; i <= to; i += step) {
        ret[i] = i ? i + 'px' : i;
    }
    return ret;
}
