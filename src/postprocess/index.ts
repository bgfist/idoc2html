import * as _ from 'lodash';
import { BuildStage, debug, defaultConfig } from '../config';
import { Direction, VNode, isOriginalGhostNode, isListContainer } from '../vnode';
import { buildTree } from './build';
import { measureTree } from './measure';

/** 删除幽灵节点，这些节点本身没样式 */
function removeGhostNodes(vnode: VNode) {
    if (vnode.children.length) {
        vnode.children = _.filter(vnode.children, n => !isOriginalGhostNode(n));
    }
}

/** 扩大幽灵节点(仅做flex盒子用，本身没样式) */
function expandGhostNodes(parent: VNode) {
    const isGhostFlexBox = (child: VNode) => {
        return (
            child.direction &&
            child.direction !== parent.direction &&
            isOriginalGhostNode(child) &&
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
