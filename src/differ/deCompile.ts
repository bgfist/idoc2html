import _ from 'lodash';
import { Role, VNode, newVNode } from '../vnode';

function dom2VNode(dom: Element): VNode {
    const attributes: Record<string, string> = {};
    let style: Record<string, string> = {};
    let id: string | undefined;
    let role: Role[] = [];
    let classList: string[] = [];
    _.each(dom.attributes, attribute => {
        const name = attribute.name;
        const value = attribute.value;

        if (!value) {
        } else if (name === 'id') {
            id = value;
        } else if (name === 'role') {
            role = value.split(',') as Role[];
            return;
        } else if (name === 'style') {
            style = value
                .split(';')
                .map(s => s.trim())
                .filter(Boolean)
                .reduce<Record<string, string>>((obj, cur) => {
                    const [n, v] = cur.split(/:\s*/);
                    obj[n] = v;
                    return obj;
                }, {});
        } else if (name === 'class') {
            classList = value.split(' ');
        } else if (
            // 调试属性不需要
            name === 'id' ||
            name === 'd' ||
            name === 'w' ||
            name === 'h'
        ) {
            return;
        } else {
            attributes[name] = value;
        }
    });

    let children: VNode[] = [];
    let textContent: string | VNode[] = '';

    if (
        _.every(
            dom.childNodes,
            child => child.nodeType === Node.TEXT_NODE || (child as Element).tagName.toLowerCase() === 'br'
        )
    ) {
        textContent = _.map(dom.childNodes, child => {
            if (child.nodeType === Node.TEXT_NODE) {
                return child.nodeValue;
            } else {
                return '<br/>';
            }
        }).join('');
    } else if (_.every(dom.children, child => child.tagName.toLowerCase() === 'span')) {
        textContent = _.map(dom.children, dom2VNode);
    } else {
        children = _.map(dom.children, dom2VNode);
    }

    return newVNode({
        tagName: dom.tagName.toLowerCase(),
        id,
        classList,
        attributes,
        children,
        textContent,
        textMultiLine: false,
        style,
        role,
        bounds: null as any
    });
}

export function html2VNode(html: string) {
    const parser = new DOMParser();

    try {
        const doc = parser.parseFromString(html, 'text/html');
        const page = doc.body.firstElementChild!;
        return dom2VNode(page);
    } catch (err) {
        console.error('无效的html', err);
        throw err;
    }
}
