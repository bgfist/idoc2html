import * as _ from 'lodash';
import {
    VNode,
    SizeSpec,
    Direction,
    isRole,
    Dimension,
    DimensionSpec,
    isFlexWrapLike,
    isListWrapContainer
} from '../vnode';
import { assert } from '../utils';

/** 根据子元素确定父盒子的尺寸类型 */
export function measureParentSizeSpec(parent: VNode, grandParent: VNode) {
    const isAttachNode = _.includes(grandParent.attachNodes, parent);

    if (isAttachNode) {
        if (!parent.widthSpec || !parent.heightSpec) {
            console.debug('遇到绝对定位裸盒子', parent.id, parent.role);
        }

        if (!parent.widthSpec) {
            if (canChildStretchWithParent(parent, grandParent, 'width')) {
                parent.widthSpec = SizeSpec.Constrained;
            } else {
                parent.widthSpec = SizeSpec.Fixed;
            }
        }

        if (!parent.heightSpec) {
            if (canChildStretchWithParent(parent, grandParent, 'height')) {
                parent.heightSpec = SizeSpec.Constrained;
            } else {
                parent.heightSpec = SizeSpec.Fixed;
            }
        }

        return;
    }

    if (parent.direction === Direction.Row) {
        if (!parent.widthSpec) {
            limitParentJustifyAsPossible(parent, 'widthSpec');
        }
        // 针对align方向
        if (!parent.heightSpec) {
            // 处理flexWrap
            if (isRole(parent, 'list-wrap')) {
                parent.heightSpec = SizeSpec.Auto;
                return;
            }
            limitParentAlignAsPossible(parent, 'heightSpec');
        }
    } else if (parent.direction === Direction.Column) {
        if (!parent.heightSpec) {
            limitParentJustifyAsPossible(parent, 'heightSpec');
        }
        // 针对align方向
        if (!parent.widthSpec) {
            limitParentAlignAsPossible(parent, 'widthSpec');
        }
    } else {
        assert(!parent.children.length, '没有direction的元素应该没有children');

        if (!parent.widthSpec || !parent.heightSpec) {
            console.debug('遇到裸盒子', parent.id, parent.role);
        }

        // 裸盒子的justifySpec/alignSpec待定，由父亲去算
    }
}

/** 子节点是否能随父亲拉伸 */
export function canChildStretchWithParent(child: VNode, parent: VNode, dimension: Dimension) {
    const anotherDimension = dimension === 'width' ? 'height' : 'width';
    return (
        // 简单判断？超过一半宽就拉伸
        child.bounds[dimension] * 2 > parent.bounds[dimension]
        // 如果是横着的长方形，则认为可以拉伸
        // child.bounds[dimension] > child.bounds[anotherDimension]
    );
}

/** 尽可能将父亲的justify尺寸类型设得更受限 */
function limitParentJustifyAsPossible(parent: VNode, justifySpec: DimensionSpec) {
    // if (_.every(parent.children, child => child[justifySpec] === SizeSpec.Fixed)) {
    //     // TODO: 并且所有元素之间overlap产生了负间距。说明它们实际上是一个整体
    //     parent[justifySpec] = SizeSpec.Fixed;
    //     return;
    // }

    parent[justifySpec] = SizeSpec.Auto;
}

/** 尽可能将父亲的align尺寸类型设得更受限 */
function limitParentAlignAsPossible(parent: VNode, alignSpec: DimensionSpec) {
    // 只要有一个子节点需要自动撑开，则父节点必须由着它一起撑开
    if (_.some(parent.children, child => child[alignSpec] === SizeSpec.Auto)) {
        // if (alignSpec === 'widthSpec' && _.some(parent.children, child => child.widthSpec === SizeSpec.Auto && isListWrapContainer(child))) {
        //     parent[alignSpec] = SizeSpec.Constrained;
        // } else {
        parent[alignSpec] = SizeSpec.Auto;
        // }
    }
    // 如果都由父亲分配尺寸，则父亲给个最小尺寸即可
    else if (_.every(parent.children, child => child[alignSpec] === SizeSpec.Constrained)) {
        parent[alignSpec] = SizeSpec.Auto;
    }
    // 剩下的情况就是Fixed和Constrained，必有Fixed，则Constrained已经可以撑开了，直接固定父亲的尺寸
    else {
        parent[alignSpec] = SizeSpec.Fixed;
    }
}
