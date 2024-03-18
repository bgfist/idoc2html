import * as _ from 'lodash';
import { allNumsEqual, numEq, numGt, numLt, removeEle } from '../utils';
import { Direction, R, SizeSpec, VNode, getClassList, isFlexWrapLike, newVNode } from '../vnode';

/** 生成justify-content */
export function measureFlexJustify(parent: VNode) {
    const children = parent.children;

    const ssf = parent.direction === Direction.Row ? 'left' : 'top';
    const eef = parent.direction === Direction.Row ? 'right' : 'bottom';
    const ss = ssf[0];
    const ee = eef[0];
    const xy = parent.direction === Direction.Row ? 'x' : 'y';
    const justifySpec = parent.direction === Direction.Row ? 'widthSpec' : 'heightSpec';

    // 根据children在node中的位置计算flex主轴布局
    const ranges = _.zip(
        [...children.map(n => n.bounds[ssf]), parent.bounds[eef]],
        [parent.bounds[ssf], ...children.map(n => n.bounds[eef])]
    ) as [number, number][];
    const gaps = ranges.map(([p, n]) => p - n);
    const startGap = gaps.shift()!;
    const endGap = gaps.pop()!;
    const equalMiddleGaps = allNumsEqual(gaps);
    let justifySide =
        numEq(startGap, endGap) && !numEq(startGap, 0) ? 'center'
        : numLt(startGap, endGap) ? 'start'
        : 'end';

    function maybeInsertFlex1() {
        if (
            parent[justifySpec] === SizeSpec.Auto &&
            !getClassList(parent).some(className => className.startsWith(`min-${justifySpec.slice(0, 1)}-`))
        ) {
            // 由内容自动撑开，则必须具有最小尺寸，否则flex1无效
            return;
        }

        // 第一个间隙是左边距

        if (gaps.length - 1 < 2) {
            // 2个及以上元素才能用flex1做弹性拉伸
            return;
        }

        // 可以通过flex1实现和stretch类似的效果
        const flex1GapIndex = (() => {
            // TODO: 生成多个flex1
            const maxGap = _.max(gaps)!;
            // 优先让后面的撑开
            return _.lastIndexOf(gaps, maxGap);
        })();

        if (flex1GapIndex === 0) {
            // 第一个间隙不能撑开
            return;
        }

        gaps[flex1GapIndex] = 0;
        gaps.splice(flex1GapIndex, 0, 0);

        const sf = parent.direction === Direction.Row ? 'top' : 'left';
        const ef = parent.direction === Direction.Row ? 'bottom' : 'right';
        const spec1 = parent.direction === Direction.Row ? 'width' : 'height';
        const spec2 = parent.direction === Direction.Row ? 'height' : 'width';
        const pos = Math.round(parent.bounds[sf] + parent.bounds[ef] / 2);
        const [eefn, ssfn] = ranges[flex1GapIndex];

        const flex1Vnode = newVNode({
            bounds: {
                [sf]: pos,
                [ef]: pos,
                [ssf]: ssfn,
                [eef]: eefn,
                [spec1]: eefn - ssfn,
                [spec2]: 0
            } as any,
            classList: [],
            [`${spec1}Spec`]: SizeSpec.Constrained,
            [`${spec2}Spec`]: SizeSpec.Fixed
        });
        if (parent[justifySpec] === SizeSpec.Auto) {
            flex1Vnode.classList.push(R`min-${spec1.slice(0, 1)}-${flex1Vnode.bounds[spec1]}`);
        }

        children.splice(flex1GapIndex, 0, flex1Vnode);
    }

    function defaultJustify() {
        gaps.unshift(startGap);

        maybeInsertFlex1();

        if (justifySide === 'center') {
            gaps.forEach((g, i) => {
                if (i < 1) {
                    return;
                }
                children[i].classList.push(R`m${ss}-${g}`);
            });
            parent.classList.push(R`p${xy}-${startGap}`);
        }
        // 自动撑开就干脆全部往下margin
        else if (parent[justifySpec] === SizeSpec.Auto || justifySide === 'start') {
            gaps.push(endGap);
            gaps.slice(1).forEach((g, i) => {
                children[i].classList.push(R`m${ee}-${g}`);
            });
            parent.classList.push(R`p${ss}-${startGap}`);
        } else if (justifySide === 'end') {
            gaps.forEach((g, i) => {
                children[i].classList.push(R`m${ss}-${g}`);
            });
            parent.classList.push(R`p${ee}-${endGap}`);
        }
    }

    function sideJustify() {
        if (justifySide === 'center') {
            parent.classList.push('justify-center');
        } else if (justifySide === 'start') {
            //
        } else if (justifySide === 'end') {
            parent.classList.push('justify-end');
        }

        if (equalMiddleGaps && children.length > 1) {
            parent.classList.push(R`space-${xy}-${gaps[0]}`);

            if (justifySide === 'start') {
                parent.classList.push(R`p${ss}-${startGap}`);
            } else if (justifySide === 'end') {
                parent.classList.push(R`p${ee}-${endGap}`);
            }
        } else {
            if (justifySide === 'center') {
                _.each(children.slice(1), (child, i) => {
                    child.classList.push(R`m${ss}-${gaps[i]}`);
                });
            } else if (justifySide === 'start') {
                gaps.unshift(startGap);
                _.each(children, (child, i) => {
                    child.classList.push(R`m${ss}-${gaps[i]}`);
                });
            } else if (justifySide === 'end') {
                gaps.push(endGap);
                _.each(children, (child, i) => {
                    child.classList.push(R`m${ee}-${gaps[i]}`);
                });
            }
        }
    }

    if (justifySpec === 'widthSpec' && parent[justifySpec] === SizeSpec.Auto) {
        // 对多行元素需要设置固定尺寸
        _.each(children, child => {
            if (isFlexWrapLike(child) && child[justifySpec] === SizeSpec.Auto) {
                child[justifySpec] = SizeSpec.Fixed;
            }
        });
    }

    // 已经在扩充auto元素尺寸时指定过了
    parent.classList = getClassList(parent);
    const specifiedSide = parent.classList.find(className => className.startsWith('justify-'));
    if (specifiedSide) {
        // if (specifiedSide === 'justify-center' && numEq(startGap, 0)) {
        //     console.warn('父容器指定我居中显示，但实际我需要justify-between');
        //     removeEle(parent.classList, specifiedSide);
        // } else {
        removeEle(parent.classList, specifiedSide);
        justifySide = specifiedSide.split('justify-')[1];
        sideJustify();
        return;
        // }
    }

    if (parent[justifySpec] === SizeSpec.Auto) {
        defaultJustify();
    }
    // 一个子元素, 或者子元素之间紧挨在一起视同为一个元素
    else if (!gaps.length || (equalMiddleGaps && numEq(gaps[0], 0))) {
        // TODO: 单行居中，多行居左?
        // children.length === 1 && justifySpec === 'widthSpec' && isFlexWrapLike(children[0])
        sideJustify();
    }
    // 中间间隔相等
    else if (equalMiddleGaps) {
        const sameGap = gaps[0];

        if (numEq(startGap, endGap) && numEq(startGap * 2, gaps[0]) && !numEq(startGap, 0)) {
            parent.classList.push('justify-around');
        } else if (numGt(sameGap, startGap) && numGt(sameGap, endGap)) {
            parent.classList.push(R`justify-between p${ss}-${startGap} p${ee}-${endGap}`);
        } else {
            sideJustify();
        }
    } else {
        const maxGap = _.max(gaps)!;
        if (numGt(maxGap, startGap) && numGt(maxGap, endGap)) {
            defaultJustify();
        } else {
            sideJustify();
        }
    }

    // 对所有灵活伸缩的元素设置flex1
    _.each(children, child => {
        if (child[justifySpec] === SizeSpec.Constrained) {
            child.classList.push('flex-1');
        }
    });
}
