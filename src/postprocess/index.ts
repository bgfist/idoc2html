import * as _ from 'lodash';
import { BuildStage, debug, defaultConfig } from '../main/config';
import { Direction, VNode, isOriginalGhostNode, isListContainer, isTextNode } from '../vnode';
import { buildTree } from './build';
import { measureTree } from './measure';

/** 删除幽灵节点，这些节点本身没样式 */
function removeGhostNodes(nodes: VNode[]) {
    return _.filter(nodes, n => {
        if (isOriginalGhostNode(n) && ghostNodeCanRemove(n)) {
            return false;
        }
        return true;
    });
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

// TODO: 仍可优化
function ghostNodeCanRemove(vnode: VNode) {
    // 只要有一个文本节点，则最好不要拆解这个幽灵节点
    if (_.some(vnode.children, child => isTextNode(child))) {
        return false;
    }
    return true;
}

/** 对节点树进行重建/重组/布局 */
export function postprocess(vnode: VNode) {
    if (!debug.keepOriginalTree) {
        function unwrapAllNodes(vnode: VNode) {
            const vnodes: VNode[] = [];
            const collectVNodes = (vnode: VNode) => {
                vnodes.push(vnode);

                if (
                    defaultConfig.removeGhostNodes &&
                    isOriginalGhostNode(vnode) &&
                    !ghostNodeCanRemove(vnode)
                ) {
                    // 这一层不能拆解，往下可以继续拆，只要都在这个盒子里就行
                    vnode.children = unwrapAllNodes(vnode);
                    return;
                }

                _.each(vnode.children, collectVNodes);
                vnode.children = [];
            };
            _.each(vnode.children, collectVNodes);

            if (defaultConfig.removeGhostNodes) {
                return removeGhostNodes(vnodes);
            }
            return vnodes;
        }

        vnode.children = unwrapAllNodes(vnode);
    }

    if (debug.buildToStage >= BuildStage.Tree) {
        buildTree(vnode);
    }

    if (debug.buildToStage >= BuildStage.Measure) {
        measureTree(vnode);
    }
}
