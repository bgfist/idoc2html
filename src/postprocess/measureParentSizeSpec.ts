import * as _ from 'lodash';
import { VNode, SizeSpec, Direction, isRole, Dimension } from '../vnode';
import { assert } from '../utils';

/** 根据子元素确定父盒子的尺寸类型 */
export function measureParentSizeSpec(parent: VNode, grandParent: VNode) {
    const isAttachNode = _.includes(grandParent.attachNodes, parent);

    if (isAttachNode) {
        if (!parent.widthSpec || !parent.heightSpec) {
            console.debug('遇到绝对定位裸盒子', parent.id, parent.role);
        }

        if (!parent.widthSpec) {
            if (checkChildSizeOverHalf(parent, grandParent, 'width')) {
                parent.widthSpec = SizeSpec.Constrained;
            } else {
                parent.widthSpec = SizeSpec.Fixed;
            }
        }

        if (!parent.heightSpec) {
            if (checkChildSizeOverHalf(parent, grandParent, 'height')) {
                parent.heightSpec = SizeSpec.Constrained;
            } else {
                parent.heightSpec = SizeSpec.Fixed;
            }
        }

        return;
    }

    if (parent.direction === Direction.Row) {
        if (!parent.widthSpec) {
            parent.widthSpec = SizeSpec.Auto;
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
            parent.heightSpec = SizeSpec.Auto;
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

        if (!parent.widthSpec) {
            if (grandParent.direction === Direction.Row) {
                parent.widthSpec = SizeSpec.Fixed;
            }
        }

        if (!parent.heightSpec) {
            if (grandParent.direction === Direction.Column) {
                parent.heightSpec = SizeSpec.Fixed;
            }
        }
    }
}

/** 检查子节点的尺寸是否超过父节点一半 */
export function checkChildSizeOverHalf(child: VNode, parent: VNode, dimension: Dimension) {
    return child.bounds[dimension] * 2 > parent.bounds[dimension];
}

/** 尽可能将父亲的尺寸类型设得更受限 */
function limitParentAlignAsPossible(parent: VNode, alignSpec: 'widthSpec' | 'heightSpec') {
    // 只要有一个子节点需要自动撑开，则父节点必须由着它一起撑开
    if (_.some(parent.children, child => child[alignSpec] === SizeSpec.Auto)) {
        parent[alignSpec] = SizeSpec.Auto;
    }
    // 如果都由父亲分配尺寸，那父亲也由祖父分配尺寸
    else if (_.every(parent.children, child => child[alignSpec] === SizeSpec.Constrained)) {
        parent[alignSpec] = SizeSpec.Constrained;
    }
    // 剩下的情况就是Fixed和Constrained，必有Fixed，则Constrained已经可以撑开了，直接固定父亲的尺寸
    else {
        parent[alignSpec] = SizeSpec.Fixed;
    }
}
