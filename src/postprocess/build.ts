import * as _ from 'lodash';
import { VNode } from '../vnode';
import { assert } from '../utils';
import { buildFlexBox } from './buildFlexBox';
import { buildListNodes } from './buildListNodes';
import { buildMissingNodes } from './buildMissingNodes';
import { mergeUnnessaryNodes } from './mergeNodes';
import { measureParentSizeSpec } from './measureParentSizeSpec';

/** 生成规范的flexbox树结构 */
export function buildTree(vnode: VNode) {
    if (!vnode.direction) {
        mergeUnnessaryNodes(vnode);
        buildMissingNodes(vnode);
        buildListNodes(vnode);
        buildFlexBox(vnode);
    }
    assert(
        _.isEmpty(vnode.children) ? _.isNil(vnode.direction) : !_.isNil(vnode.direction),
        '节点如果有孩子，则必须有方向'
    );

    _.each(vnode.children, buildTree);
    _.each(vnode.attachNodes, buildTree);
    _.each(vnode.children, child => measureParentSizeSpec(child, vnode));
    _.each(vnode.attachNodes, child => measureParentSizeSpec(child, vnode));
}
