import * as _ from 'lodash';
import { BuildStage, debug, defaultConfig } from '../config';
import { anyElesIn, numEq } from '../utils';
import {
    Direction,
    R,
    R2,
    SizeSpec,
    VNode,
    getClassList,
    isGhostNode,
    isListContainer,
    isListWrapContainer,
    isListXContainer,
    isListYContainer,
    normalizeClassName
} from '../vnode';
import { buildFlexBox } from './buildFlexBox';
import { buildListNodes } from './buildListNodes';
import { buildMissingNodes } from './buildMissingNodes';
import { measureFlexAlign } from './measureFlexAlign';
import { measureFlexJustify } from './measureFlexJustify';
import { measureFlexWrapLayout } from './measureListLayout';
import { mergeUnnessaryFlexBox, mergeUnnessaryNodes } from './mergeNodes';

/** 删除幽灵节点，这些节点本身没样式 */
function removeGhostNodes(vnode: VNode) {
    if (vnode.children.length) {
        vnode.children = _.filter(vnode.children, n => !isGhostNode(n));
    }
}

/** 扩大幽灵节点(仅做flex盒子用，本身没样式) */
function expandGhostNodes(parent: VNode) {
    const isGhostFlexBox = (child: VNode) => {
        return (
            child.direction &&
            child.direction !== parent.direction &&
            isGhostNode(child) &&
            !isListContainer(child)
        );
    };
    if (parent.direction === Direction.Row) {
        // 只扩充高度
        _.each(parent.children, child => {
            if (isGhostFlexBox(child)) {
                child.bounds.top = parent.bounds.top;
                child.bounds.bottom = parent.bounds.bottom;
                child.bounds.height = parent.bounds.bottom - parent.bounds.top;

                // 此处不需要修改sizeSpec，会在布局时自动扩充
            }
        });
    }
    if (parent.direction === Direction.Column) {
        // 只扩充宽度
        _.each(parent.children, child => {
            if (isGhostFlexBox(child)) {
                child.bounds.left = parent.bounds.left;
                child.bounds.right = parent.bounds.right;
                child.bounds.width = parent.bounds.right - parent.bounds.left;
            }
        });
    }
}

/** 根据子元素确定父盒子的尺寸类型 */
function measureParentSizeSpec(parent: VNode, grandParent: VNode) {
    const children = parent.children;
    if (!children.length) {
        // if (maybeDivider(parent)) {
        //     return;
        // }

        // TODO: 裸盒子的尺寸如何确定
        if (!parent.widthSpec || !parent.heightSpec) {
            console.debug('遇到裸盒子', parent.id, parent.role);
        }

        if (!parent.widthSpec) {
            if (_.includes(grandParent.attachNodes, parent)) {
                // 绝对定位的没法确定尺寸了，先用Fixed
                parent.widthSpec = SizeSpec.Fixed;
            } else if (grandParent.direction === Direction.Column) {
                parent.widthSpec = SizeSpec.Constrained;
            } else {
                parent.widthSpec = SizeSpec.Fixed;
            }
        }

        if (!parent.heightSpec) {
            if (_.includes(grandParent.attachNodes, parent)) {
                // 绝对定位的没法确定尺寸了，先用Fixed
                parent.heightSpec = SizeSpec.Fixed;
            } else if (grandParent.direction === Direction.Row) {
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
        if (!parent.heightSpec) {
            if (_.every(children, child => child.heightSpec === SizeSpec.Fixed)) {
                parent.heightSpec = SizeSpec.Fixed;
            } else {
                parent.heightSpec = SizeSpec.Auto;
            }
        }
    }

    if (parent.direction === Direction.Column) {
        if (!parent.heightSpec) {
            parent.heightSpec = SizeSpec.Auto;
        }
        if (!parent.widthSpec) {
            if (_.every(children, child => child.widthSpec === SizeSpec.Fixed)) {
                parent.widthSpec = SizeSpec.Fixed;
            } else {
                parent.widthSpec = SizeSpec.Auto;
            }
        }
    }
}

/** 生成flexbox布局 */
function measureFlexLayout(parent: VNode) {
    if (parent.children?.length) {
        parent.classList.push('flex');
        if (parent.direction === Direction.Column) {
            parent.classList.push('flex-col');
        }

        if (isListWrapContainer(parent)) {
            measureFlexWrapLayout(parent);
        } else {
            measureFlexAlign(parent);
            measureFlexJustify(parent);
        }
    }

    if (parent.widthSpec === SizeSpec.Fixed) {
        parent.classList.push(R`w-${parent.bounds.width}`);
    }
    if (parent.heightSpec === SizeSpec.Fixed) {
        parent.classList.push(R`h-${parent.bounds.height}`);
    }
}

/** 生成绝对定位 */
function measureAttachPosition(parent: VNode) {
    const attachNodes = parent.attachNodes;
    if (!attachNodes || !attachNodes.length) {
        return;
    }
    _.each(attachNodes, attachNode => {
        const [left, right, top, bottom] = [
            attachNode.bounds.left - parent.bounds.left,
            parent.bounds.right - attachNode.bounds.right,
            attachNode.bounds.top - parent.bounds.top,
            parent.bounds.bottom - attachNode.bounds.bottom
        ];
        if (anyElesIn(getClassList(parent), ['relative', 'absolute', 'fixed'])) {
            // 已经脱离文档流
        } else {
            parent.classList.push('relative');
        }
        attachNode.classList.push('absolute');

        function decideAutoExpandSide(horizontal: boolean) {
            if (horizontal) {
                let leftSpace = left,
                    rightSpace = right;
                if (left < 0 && right > 0) {
                    rightSpace = parent.bounds.width - rightSpace;
                } else if (right < 0 && left > 0) {
                    leftSpace = parent.bounds.width - leftSpace;
                }
                return Math.abs(leftSpace) < Math.abs(rightSpace) ? `left-${left}` : `right-${right}`;
            } else {
                let topSpace = top,
                    bottomSpace = bottom;
                if (top < 0 && bottom > 0) {
                    bottomSpace = parent.bounds.height - bottomSpace;
                } else if (bottom < 0 && top > 0) {
                    topSpace = parent.bounds.height - topSpace;
                }
                return Math.abs(topSpace) < Math.abs(bottomSpace) ? `top-${top}` : `bottom-${bottom}`;
            }
        }

        if (
            attachNode.widthSpec === SizeSpec.Auto &&
            numEq(left, right) &&
            attachNode.bounds.width * 2 > parent.bounds.width
        ) {
            attachNode.widthSpec = SizeSpec.Constrained;
        }

        if (attachNode.widthSpec === SizeSpec.Constrained) {
            attachNode.classList.push(R2`left-${left} right-${right}`);
        } else {
            if (attachNode.widthSpec === SizeSpec.Fixed && numEq(left, right)) {
                // 绝对定位居中
                attachNode.classList.push('left-1/2 -translate-x-1/2');
            } else {
                attachNode.classList.push(normalizeClassName(decideAutoExpandSide(true), false));
            }
        }

        if (
            attachNode.heightSpec === SizeSpec.Auto &&
            numEq(top, bottom) &&
            attachNode.bounds.height * 2 > parent.bounds.height
        ) {
            attachNode.heightSpec = SizeSpec.Constrained;
        }

        if (attachNode.heightSpec === SizeSpec.Constrained) {
            attachNode.classList.push(R2`top-${top} bottom-${bottom}`);
        } else {
            if (attachNode.heightSpec === SizeSpec.Fixed && numEq(top, bottom)) {
                // 绝对定位居中
                attachNode.classList.push('top-1/2 -translate-y-1/2');
            } else {
                attachNode.classList.push(normalizeClassName(decideAutoExpandSide(false), false));
            }
        }
    });
}

/** 生成规范的flexbox树结构 */
function buildTree(vnode: VNode) {
    if (!vnode.direction) {
        mergeUnnessaryNodes(vnode);
        buildMissingNodes(vnode);
        buildListNodes(vnode);
        buildFlexBox(vnode);
    }
    mergeUnnessaryFlexBox(vnode);

    _.each(vnode.children, buildTree);
    _.each(vnode.attachNodes, buildTree);
    _.each(vnode.children, child => measureParentSizeSpec(child, vnode));
    _.each(vnode.attachNodes, child => measureParentSizeSpec(child, vnode));
}

/** 计算flexbox布局 */
function measureTree(vnode: VNode) {
    // TODO: 前面会创建一些幽灵盒子，都是flex容器，需尝试扩大容器
    // expandGhostNodes(vnode);

    // 从根节点开始，根节点宽高都是弹性尺寸
    measureFlexLayout(vnode);
    // 计算好自身的尺寸，才能计算绝对定位元素的尺寸
    measureAttachPosition(vnode);

    _.each(vnode.children, measureTree);
    _.each(vnode.attachNodes, measureTree);
}

/** 对节点树进行重建/重组/布局 */
export function postprocess(vnode: VNode) {
    if (!debug.keepOriginalTree) {
        (function unwrapAllNodes() {
            const vnodes: VNode[] = [];
            const collectVNodes = (vnode: VNode) => {
                vnodes.push(vnode);
                _.each(vnode.children, collectVNodes);
                vnode.children = [];
            };
            _.each(vnode.children, collectVNodes);
            vnode.children = vnodes;
        })();
        if (defaultConfig.removeGhostNodes) {
            removeGhostNodes(vnode);
        }
    }

    if (debug.buildToStage >= BuildStage.Tree) {
        buildTree(vnode);
    }

    if (debug.buildToStage >= BuildStage.Measure) {
        measureTree(vnode);
    }
}
