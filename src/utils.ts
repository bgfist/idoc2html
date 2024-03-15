import * as _ from 'lodash';

export function assert(condition: boolean, msg: string) {
    if (!condition) {
        debugger;
        throw new Error(msg);
    }
}

export function unreachable(): never {
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

const TOLERANCE = 3;
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

export interface Range<T> {
    start: number;
    end: number;
    ele: T;
}

export function collectRepeatRanges<T>(arr: T[], compareFn: (a: T, b: T) => boolean, isValidRange: (range: Range<number>) => boolean) {
    const ranges: Range<number>[] = [];

    for (let compareIndex = 0; compareIndex < arr.length; compareIndex++) {
        compareLoop: for (let i = compareIndex + 1; i < arr.length; i++) {
            if (!compareFn(arr[compareIndex], arr[i])) {
                continue;
            }

            // 获取重复的节点
            const baseRepeatStart = compareIndex;
            const repeatGroupCount = i - compareIndex;
            let repeatCount = repeatGroupCount + 1;

            if (repeatCount % repeatGroupCount === 0) {
                const tempRange = {
                    start: baseRepeatStart,
                    end: baseRepeatStart + repeatCount,
                    ele: repeatGroupCount
                };
                if (!isValidRange(tempRange)) {
                    continue compareLoop;
                }
            }

            while (++i < arr.length && compareFn(arr[++compareIndex], arr[i])) {
                repeatCount++;

                if (repeatCount % repeatGroupCount === 0) {
                    const tempRange = {
                        start: baseRepeatStart,
                        end: baseRepeatStart + repeatCount,
                        ele: repeatGroupCount
                    };
                    if (!isValidRange(tempRange)) {
                        continue compareLoop;
                    }
                }
            }

            const mod = repeatCount % repeatGroupCount;
            if (mod !== 0) {
                console.warn('重复分组不完整!');
                repeatCount -= mod;
                i -= mod;
            }
            const repeatTimes = Math.round(repeatCount / repeatGroupCount);

            // 重复节点之间断开了
            if (repeatTimes === 0) {
                console.warn('重复节点断开了!');
                continue;
            }

            if (repeatTimes === 1) {
                console.warn('只有一个节点，不构成列表');
                continue;
            }

            ranges.push({
                start: baseRepeatStart,
                end: baseRepeatStart + repeatCount,
                ele: repeatGroupCount
            });
        }
    }

    return ranges;
}
const arr = [1, 2, 3, 2, 3, 2, 3,  5, 23, 23, 6, 7, 8, 8, 8, 9, 10];
console.log(collectRepeatRanges(arr, (a, b) => a === b, (range) => {
    if (range.ele === 1 && arr[range.start] === 23 && range.end - range.start <= 2) {
        return false;
    }
    if (range.ele === 2 && arr[range.start] * arr[range.start + 1] === 6) {
        return false;
    }
    return true;
}));

export function collectContinualRanges<T, K>(arr: T[], compareFn: (a: T, b: T) => K | boolean) {
    const ranges: Range<K>[] = [];

    let ele: K | boolean = false;
    for (let compareIndex = 0, i = 1; i < arr.length; compareIndex++, i++) {
        ele = compareFn(arr[compareIndex], arr[i]);
        if (ele) {
            const start = compareIndex;
            while (++i < arr.length && compareFn(arr[++compareIndex], arr[i])) { }
            ranges.push({
                ele: ele as K,
                start,
                end: i
            });
        }
    }
    return ranges;
}

export function replaceRangesWithEle<T>(arr: T[], ranges: Range<T>[]) {
    const ret: T[] = [];
    let start = 0;
    for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        ret.push(...arr.slice(start, range.start));
        ret.push(range.ele);
        start = range.end;
    }
    ret.push(...arr.slice(start));
    return ret;
}

