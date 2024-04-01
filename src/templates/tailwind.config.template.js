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

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/**/*.html'],
    theme: {
        spacing: {
            ...generateNumUnits(0, 2000)
        },
        extend: {
            borderRadius: generateNumUnits(1, 30),
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
            },
            colors: {}
        },
        fontSize: generateNumUnits(0, 80, 1),
        lineHeight: generateNumUnits(10, 120)
    }
};
