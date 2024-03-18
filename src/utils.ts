import * as _ from 'lodash';

export function assert(condition: boolean, msg: string) {
    if (!condition) {
        debugger;
        throw new Error(msg);
    }
}

export function unreachable(): never {
    debugger;
    throw new Error('不可能执行到这！');
}

export function filterEmpty<T>(t: T | null | undefined): t is T {
    return !!t;
}

export function second<T>(x: [unknown, T]) {
    return x[1];
}

export function removeEle<T>(arr: T[], ele: T) {
    _.remove(arr, item => item === ele);
}

export function removeEles<T>(arr: T[], ele: T[]) {
    _.remove(arr, item => ele.indexOf(item) >= 0);
}

export function groupByWith<T, K>(
    arr: T[],
    iteratee: (item: T) => K,
    compare: (current: K, before: K) => boolean
) {
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
        if (char >= 0x00 && char <= 0x7f) {
            // 半角字符
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

/** 寻找重复序列 */
export function collectRepeatRanges<T>(
    arr: T[],
    compareFn: (a: T, b: T) => boolean,
    isValidRange: (range: Range<number>) => boolean
) {
    // number表示序列包含几个元素
    const ranges: Range<number>[] = [];

    for (let compareIndex = 0; compareIndex < arr.length; compareIndex++) {
        for (let i = compareIndex + 1; i < arr.length; i++) {
            if (!compareFn(arr[compareIndex], arr[i])) {
                continue;
            }

            // 获取重复的节点
            const baseRepeatStart = compareIndex;
            const repeatGroupCount = i - compareIndex;
            let repeatCount = repeatGroupCount + 1;
            let j = compareIndex;
            while (++i < arr.length && compareFn(arr[++j], arr[i])) {
                repeatCount++;
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

            const range = {
                start: baseRepeatStart,
                end: baseRepeatStart + repeatCount,
                ele: repeatGroupCount
            };

            if (isValidRange(range)) {
                ranges.push(range);
                compareIndex = i;
            }
        }
    }

    return ranges;
}

// const arr = [1, 2, 3, 2, 3, 2, 2, 3, 2, 3, 2, 5, 23, 23, 6, 7, 8, 8, 8, 9, 10];
// const ranges = collectRepeatRanges(arr, (a, b) => a === b, (range) => {
//     if (range.ele === 1 && arr[range.start] === 23 && range.end - range.start <= 2) {
//         return false;
//     }
//     if (arr[range.start] === 2 && arr[range.start + 1] === 3) {
//         return false;
//     }
//     return true;
// });
// console.log(ranges.map(range => `${range.start}-${range.end}: [${arr.slice(range.start, range.end).join(',')}]`));
// console.log(replaceRangesWithEle(arr, ranges.map(range => {
//     return {
//         ...range,
//         ele: 520
//     }
// })));
// console.log(collectContinualRanges(arr, (a, b) => a === b && 'ok'));

// const arr = [
//     { type: 'a', left: 50, top: 50, width: 80, height: 100, id: 1 },
//     { type: 'a', left: 150, top: 50, width: 90, height: 100, id: 2 },
//     { type: 'a', left: 50, top: 200, width: 100, height: 100, id: 3 },
//     { type: 'a', left: 170, top: 200, width: 110, height: 100, id: 4 },
//     { type: 'b', left: 0, top: 400, width: 50, height: 80, id: 5 },
//     { type: 'b', left: 100, top: 400, width: 60, height: 80, id: 6 },
//     { type: 'c', left: 0, top: 500, width: 80, height: 100, id: 7 },
//     { type: 'c', left: 100, top: 500, width: 80, height: 100, id: 8 },
//     { type: 'd', left: 15, top: 600, width: 60, height: 80, id: 9 },
//     { type: 'd', left: 115, top: 600, width: 60, height: 80, id: 10 },
// ];

/** 寻找同值的连续序列 */
export function collectContinualRanges<T, K>(
    arr: T[],
    compareFn: (a: T, b: T) => K | boolean,
    isValidRange: (range: Range<K>) => boolean
) {
    const ranges: Range<K>[] = [];

    let ele: K | boolean = false;
    for (let compareIndex = 0, i = 1; i < arr.length; compareIndex++, i++) {
        ele = compareFn(arr[compareIndex], arr[i]);
        if (ele) {
            const start = compareIndex;
            do {
                i++;
                compareIndex++;
            } while (i < arr.length && compareFn(arr[compareIndex], arr[i]));
            {
            }
            for (; i > start + 1; i--, compareIndex--) {
                const range = {
                    ele: ele as K,
                    start,
                    end: i
                };
                if (isValidRange(range)) {
                    ranges.push({
                        ele: ele as K,
                        start,
                        end: i
                    });
                    break;
                }
            }
        }
    }
    return ranges;
}

// const arr = [1, 2, 2, 2, 2, 3, 4, 4, 4];
// console.log(collectContinualRanges(arr, (a, b) => a === b, range => {
//     console.log(`${range.start}-${range.end}: [${arr.slice(range.start, range.end).join(',')}]`);

//     if (range.start === 1 && range.end === 3) {
//         return false;
//     }

//     return true;
// }));

/** 将数组对应range区间的元素替换成相应元素 */
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

/** 取每个数组中的一个元素构成一个组合 */
export function combineAndIterate<T>(arrays: T[][], callback: (combination: T[]) => boolean): void {
    if (arrays.length === 0) {
        return;
    }
    // 计算所有数组的乘积来确定循环次数
    let maxIterations = arrays.reduce((product, array) => product * array.length, 1);
    // 生成一个数组，用于存储每个数组的索引
    let indices = arrays.map(array => 0);
    const used = arrays.map(array => new Set<number>());
    for (let iteration = 0; iteration < maxIterations; iteration++) {
        const eleUsed = used.some((set, arrayIndex) => {
            return set.has(indices[arrayIndex]);
        });
        if (!eleUsed) {
            // 创建当前组合
            let combination = indices.map((eleIndex, arrayIndex) => arrays[arrayIndex][eleIndex]);
            // 调用回调函数处理当前组合
            const isValid = callback(combination.filter(Boolean));
            if (isValid) {
                used.forEach((set, arrayIndex) => {
                    set.add(indices[arrayIndex]);
                });
            }
        }
        // 更新索引，以遍历下一个组合
        for (let i = indices.length - 1; i >= 0; i--) {
            if (indices[i] < arrays[i].length - 1) {
                indices[i]++;
                break;
            } else {
                indices[i] = 0;
            }
        }
    }
}
