import * as _ from 'lodash';

export function assert(condition: boolean, msg: string) {
    if (!condition) {
        debugger;
        throw new Error(msg);
    }
}

export function unreachable() {
    throw new Error('不可能执行到这！');
}

export function filterEmpty<T>(t: T | null | undefined): t is T {
    return !!t;
}

export function second<T>(x: [unknown, T]) {
    return x[1];
}

export function removeEle<T>(arr: T[], ele: T) {
    _.remove(arr, (item) => item === ele);
}

export function removeEles<T>(arr: T[], ele: T[]) {
    _.remove(arr, (item) => ele.indexOf(item) >= 0);
}

export function groupByWith<T, K>(arr: T[], iteratee: (item: T) => K, compare: (current: K, before: K) => boolean) {
    return arr.reduce((map, item) => {
        const key = iteratee(item);
        let found = false;
        for (const [k] of map) {
            if (compare(k, key)) {
                map.get(k)!.push(item);
                found = true;
                break;
            }
        }
        if (!found) {
            map.set(key, [item]);
        }
        return map;
    }, new Map<K, T[]>());
}

export function groupWith<T>(arr: T[], compare: (a: T, b: T) => boolean) {
    return groupByWith(arr, _.identity, compare);
}

const TOLERANCE = 2;
export function numEq(num1: number, num2: number) {
    return Math.abs(num1 - num2) <= TOLERANCE;
}
export function numGt(num1: number, num2: number) {
    return !numEq(num1, num2) && num1 > num2;
}
export function numGte(num1: number, num2: number) {
    return numEq(num1, num2) || num1 >= num2;
}
export function numLt(num1: number, num2: number) {
    return !numEq(num1, num2) && num1 < num2;
}
export function numLte(num1: number, num2: number) {
    return numEq(num1, num2) || num1 <= num2;
}

export function allNumsEqual(arr: number[]) {
    return _.uniqWith(arr, numEq).length === 1;
}
export function allElesIn<T>(arr: T[], exclude: T[]) {
    return _.difference(arr, exclude).length === 0;
}
export function anyElesIn<T>(arr: T[], exclude: T[]) {
    return _.difference(exclude, arr).length !== exclude.length;
}

export function calculateCharacterWidth(str: string) {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        if (char >= 0x00 && char <= 0x7F) { // 半角字符
            width += 0.5;
        } else {
            width += 1;
        }
    }
    return width;
}